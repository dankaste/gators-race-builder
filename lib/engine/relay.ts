import type { RelayConfig, Rider } from "./models";
import { normName, nameKeys as nameKeysOf } from "./nameMatch";

/**
 * Relay team builder (Swamp Dash Relay).
 *
 * Riders are distributed across the relay's cups and, within each cup, into
 * character teams of ~teamSize. Cups are **time-staggered heats, not
 * interchangeable bins** — the first cup (config.cups[0]) is the slowest
 * heat, the last is the fastest, mirroring the individual Swamp Dash race's
 * existing slowest-first age-band convention. The builder:
 *   1. Groups riders who requested each other (friend requests) so they land
 *      on the same team — a keep-together constraint. Groups larger than a
 *      team are split into team-sized chunks (flagged, not silently
 *      overflowed). A free-text request that doesn't match anyone by name
 *      can be resolved by hand (Rider.manualFriendMatches, set from the
 *      review screen's "match to a rider" dropdown) — additive on top of
 *      name-matching, never clearing the original unmatched note. See
 *      {@link assignCups}.
 *   2a. Sorts groups slowest→fastest (by each group's SLOWEST member's
 *      estimated Swamp Dash lap time — see lib/engine/history.ts — not the
 *      group average, so a mixed-speed friend group is never placed faster
 *      than its slowest member deserves) and partitions them across cups in
 *      that order, respecting each cup's capacity. Groups with no estimate
 *      are interleaved afterward by headcount. See {@link assignCups}.
 *   2b. Within each cup, greedily distributes its groups across character
 *      slots to converge each team's average toward that cup's own average —
 *      a standard longest-first (LPT) load-balance greedy. This pass IS
 *      still mean-converging (unlike 2a) since character teams within one
 *      cup race the same heat and should be even, not tiered.
 *   3. Assigns a leg order (1..n) within each team, slowest-estimated first,
 *      falling back to GBP seed level, then registration order.
 * Directors review/edit rankings before building (see the review step in
 * RelayBuilder.tsx, which calls {@link assignCups} directly so its live Cup
 * column can never disagree with what {@link buildRelayTeams} actually does)
 * and rebalance individual riders in the UI afterward.
 */

export interface RelaySlot {
  cup: string;
  character: string;
  riders: Rider[];
}

export interface RelayResult {
  teams: RelaySlot[];
  /** Friend-request values that couldn't be matched to a rider. */
  unmatchedFriends: { rider: string; requested: string }[];
  /** Friend groups larger than a single team — split into team-sized chunks rather than silently overflowing one slot. */
  splitGroups: { riders: string[]; teamSize: number }[];
}

const norm = normName;

/** Candidate normalized name keys for a rider (handles "First Last" and "Last, First"). */
function nameKeys(r: Rider): string[] {
  return nameKeysOf(r.firstName, r.lastName);
}

/** Free-text non-answers to a "who do you want as a teammate?" question — not a real request, don't even flag them. */
const NON_ANSWER = /^(n\/?a|none|no\s*one|nobody|-|tbd)$/i;

/**
 * A teammate-request field is a free-text box, and parents commonly list
 * more than one name ("Tyler and Thatcher", "Brayden Good, Thatcher Behum")
 * even though the form asks for one. Split on the common separators so each
 * name gets its own match attempt instead of the whole blob failing to
 * match as a single (unfindable) string.
 */
function splitNameList(text: string): string[] {
  return text
    .split(/,|;|\n|\band\b|&/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- union-find over rider indices for friend grouping ---
class DSU {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) x = this.parent[x] = this.parent[this.parent[x]];
    return x;
  }
  union(a: number, b: number) {
    this.parent[this.find(a)] = this.find(b);
  }
}

/**
 * Leg-order comparator: slowest first, fastest anchors the last leg.
 * Riders with a numeric estimate are ranked among themselves (highest
 * seconds = slowest = earliest leg); riders with no estimate fall back to
 * ascending GBP `seedLevel` (lower = more beginner/slower — the pre-existing
 * convention `relay.test.ts` pins), then registration order. Estimated and
 * unestimated riders are never compared on the same numeric scale directly —
 * when nobody on a team has an estimate, this reduces exactly to the
 * original `seedLevel`-only ordering.
 */
export function compareLegOrder(a: Rider, b: Rider): number {
  const bucket = (r: Rider) => (r.estimatedLapSeconds != null ? 0 : r.seedLevel != null ? 1 : 2);
  const key = (r: Rider) => (r.estimatedLapSeconds != null ? -r.estimatedLapSeconds : (r.seedLevel ?? 0));
  return bucket(a) - bucket(b) || key(a) - key(b);
}

export interface Group {
  indices: number[];
  /** Average estimatedLapSeconds across riders in the group that have one; null if none do. Used only for the within-cup team-balancing pass (2b). */
  avg: number | null;
  /** The group's SLOWEST member's estimatedLapSeconds (max, not average); null if none of its members have one. Used to rank/partition groups into cups (2a) — see the module doc for why max, not avg. */
  rank: number | null;
  /** Fallback signal used only when `rank` is null — see groupSeedSum. */
  seedSum: number;
  /**
   * True if the group's members' estimated times span more than roughly one
   * cup's worth of range — a mixed-speed friend group (e.g. a 6- and a
   * 12-year-old who requested each other). Surfaced as a review-table badge,
   * never blocks placement — the group still keeps-together at its slowest
   * member's tier.
   */
  mixedSpeed: boolean;
}

function groupAverage(riders: Rider[], indices: number[]): number | null {
  const times = indices.map((i) => riders[i].estimatedLapSeconds).filter((t): t is number => t != null);
  return times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
}

/** Sum of GBP seedLevel across a group (`?? 0`, matching the pre-history skillSum convention) — the fallback balancing signal when a group has no lap-time estimate. */
function groupSeedSum(riders: Rider[], indices: number[]): number {
  return indices.reduce((n, i) => n + (riders[i].seedLevel ?? 0), 0);
}

/** Split a DSU-merged group larger than `teamSize` into team-sized chunks so one slot never overflows silently. */
function splitOversizedGroups(rawGroups: number[][], teamSize: number): { groups: number[][]; splits: number[][] } {
  const groups: number[][] = [];
  const splits: number[][] = [];
  for (const g of rawGroups) {
    if (g.length <= teamSize) {
      groups.push(g);
      continue;
    }
    splits.push(g);
    for (let i = 0; i < g.length; i += teamSize) groups.push(g.slice(i, i + teamSize));
  }
  return { groups, splits };
}

interface Bin {
  capacity: number;
  count: number;
  totalSeconds: number;
  /** Fallback accumulator mirroring the pre-history `skillSum` balancing signal. */
  totalSeed: number;
}
/**
 * Longest-processing-time-first greedy load balance (the standard
 * multiprocessor-scheduling heuristic): place estimated groups (slowest
 * average first) into whichever bin with room currently has the LOWEST
 * running SUM — not average. Comparing by average looks similar but isn't:
 * once a bin gets even one high value its average locks in above the field,
 * so it never gets picked again and everything else piles into the other
 * bin(s). Sum-comparison is the textbook fix — it keeps converging bins
 * toward equal load (and, since group sizes are usually similar, equal
 * counts too, so equal sums end up meaning equal averages). Groups with no
 * estimate are placed afterward by whichever bin with room has the fewest
 * riders, tie-broken by lowest total seedLevel — the exact `(count,
 * skillSum)` rule the original single-tier balancer used, so when NO rider
 * anywhere has an estimate, every placement decision degrades to that same
 * signal. Falls back to "any bin" (ignoring capacity) only when nothing has
 * room, same as the original design.
 *
 * Used ONLY for the within-cup team pass (2b) — cups themselves (2a) are a
 * sorted tiered partition, not a mean-converging bin-pack; see
 * assignCupsToGroups.
 */
function placeGroupsLPT(groups: Group[], bins: Bin[], assign: (groupIndex: number, binIndex: number) => void) {
  const withEstimate = groups
    .map((g, idx) => ({ g, idx }))
    .filter((x) => x.g.avg != null)
    .sort((a, b) => b.g.avg! - a.g.avg!);
  const withoutEstimate = groups.map((g, idx) => ({ g, idx })).filter((x) => x.g.avg == null);

  for (const { g, idx } of withEstimate) {
    const size = g.indices.length;
    const fitting = bins.map((b, i) => i).filter((i) => bins[i].count + size <= bins[i].capacity);
    const pool = fitting.length ? fitting : bins.map((_, i) => i);
    pool.sort((a, b) => bins[a].totalSeconds - bins[b].totalSeconds);
    const target = pool[0];
    bins[target].count += size;
    bins[target].totalSeconds += g.avg! * size;
    assign(idx, target);
  }
  for (const { g, idx } of withoutEstimate) {
    const size = g.indices.length;
    const fitting = bins.map((b, i) => i).filter((i) => bins[i].count + size <= bins[i].capacity);
    const pool = fitting.length ? fitting : bins.map((_, i) => i);
    pool.sort((a, b) => bins[a].count - bins[b].count || bins[a].totalSeed - bins[b].totalSeed);
    const target = pool[0];
    bins[target].count += size;
    bins[target].totalSeed += g.seedSum;
    assign(idx, target);
  }
}

/**
 * Partition groups across cups in slowest→fastest order (cup index 0 =
 * slowest), respecting each cup's capacity. Walks groups sorted descending
 * by `rank` (each group's slowest member), advancing to the next cup before
 * a group would push the running count past `target` (an even split) or
 * `capacity` (the cup's real ceiling) — never mid-group, never past the
 * last cup. Groups with no estimate (`rank` null) are interleaved afterward
 * into whichever cup (with room) currently has the fewest riders, tied by
 * lowest seedSum — the same `(count, skillSum)` signal the old bin-pack used,
 * so an all-unestimated roster still spreads evenly by headcount alone.
 */
function assignCupsToGroups(groups: Group[], cupCount: number, capacity: number): number[] {
  const cupIndexByGroup = new Array<number>(groups.length).fill(0);
  const cupCounts = new Array<number>(cupCount).fill(0);
  const cupSeedSums = new Array<number>(cupCount).fill(0);

  const withRank = groups
    .map((g, idx) => ({ g, idx }))
    .filter((x) => x.g.rank != null)
    .sort((a, b) => b.g.rank! - a.g.rank!);
  const withoutRank = groups.map((g, idx) => ({ g, idx })).filter((x) => x.g.rank == null);

  const totalRiders = groups.reduce((n, g) => n + g.indices.length, 0);
  const target = Math.ceil(totalRiders / cupCount);

  // `target` is a SOFT even-split goal — only advances a cup that already has
  // something in it, so it never forces a cup past target when there was no
  // alternative (an indivisible group can legitimately push a cup slightly
  // over). `capacity` is a HARD ceiling — advances even an empty cup, as a
  // safety net for the (essentially unreachable, since a single group is
  // already ≤ teamSize) case of one group alone exceeding it. Keeping these
  // as two separate conditions (not `Math.min`) matters: collapsing them
  // would let the smaller of the two artificially shrink the real capacity
  // ceiling, pushing riders into a faster cup than necessary whenever group
  // sizes don't divide the roster evenly.
  let cupIdx = 0;
  for (const { g, idx } of withRank) {
    const size = g.indices.length;
    while (
      cupIdx < cupCount - 1 &&
      ((cupCounts[cupIdx] > 0 && cupCounts[cupIdx] + size > target) || cupCounts[cupIdx] + size > capacity)
    ) {
      cupIdx++;
    }
    cupIndexByGroup[idx] = cupIdx;
    cupCounts[cupIdx] += size;
  }

  for (const { g, idx } of withoutRank) {
    const size = g.indices.length;
    const fitting = cupCounts.map((_, i) => i).filter((i) => cupCounts[i] + size <= capacity);
    const pool = fitting.length ? fitting : cupCounts.map((_, i) => i);
    pool.sort((a, b) => cupCounts[a] - cupCounts[b] || cupSeedSums[a] - cupSeedSums[b]);
    const target2 = pool[0];
    cupIndexByGroup[idx] = target2;
    cupCounts[target2] += size;
    cupSeedSums[target2] += g.seedSum;
  }

  return cupIndexByGroup;
}

export interface AssignCupsResult {
  groups: Group[];
  /** Cup array index (parallel to config.cups; 0 = slowest) each group lands in. */
  cupIndexByGroup: number[];
  /** Same info flattened per-rider — cupIndexByGroup for that rider's group, by rider index into the input array. */
  riderCupIndex: number[];
  unmatchedFriends: { rider: string; requested: string }[];
  splitGroups: { riders: string[]; teamSize: number }[];
}

/**
 * Friend-group riders together (step 1) and partition those groups
 * slowest→fastest across cups (step 2a). Pure, no side effects — this is the
 * single source of truth for "which cup will this rider land in," shared by
 * the review screen (live Cup column) and {@link buildRelayTeams} (the
 * actual build), so they can never disagree.
 */
export function assignCups(riders: Rider[], config: RelayConfig): AssignCupsResult {
  const { cups, characters, teamSize } = config;
  const friendField = config.friendRequestField;
  const capacity = teamSize * characters.length;

  // 1. Friend groups via union-find.
  const dsu = new DSU(riders.length);
  const byName = new Map<string, number>();
  riders.forEach((r, i) => {
    for (const k of nameKeys(r)) if (!byName.has(k)) byName.set(k, i);
  });
  const unmatchedFriends: { rider: string; requested: string }[] = [];
  if (friendField) {
    riders.forEach((r, i) => {
      const req = r.custom?.[friendField]?.trim();
      if (!req || NON_ANSWER.test(req)) return;
      for (const candidate of splitNameList(req)) {
        const target = byName.get(norm(candidate));
        if (target !== undefined && target !== i) dsu.union(i, target);
        else if (target === undefined) {
          unmatchedFriends.push({ rider: `${r.firstName} ${r.lastName}`, requested: candidate });
        }
      }
    });
  }

  // Director-confirmed matches (relay review screen) for a free-text request that
  // didn't resolve by name — unioned on top of whatever automatic matching found.
  // These don't clear the unmatchedFriends entry above (the raw text still failed
  // to auto-match, and stays visible for review) — this is purely additive.
  const byPlayerId = new Map(riders.map((r, i) => [r.playerId, i]));
  riders.forEach((r, i) => {
    for (const pid of r.manualFriendMatches ?? []) {
      const target = byPlayerId.get(pid);
      if (target !== undefined && target !== i) dsu.union(i, target);
    }
  });

  const groupsMap = new Map<number, number[]>();
  riders.forEach((_, i) => {
    const root = dsu.find(i);
    const arr = groupsMap.get(root) ?? [];
    arr.push(i);
    groupsMap.set(root, arr);
  });
  // Larger groups placed first so they claim capacity before singletons fill in.
  const rawGroups = [...groupsMap.values()].sort((a, b) => b.length - a.length);
  const { groups: indexGroups, splits } = splitOversizedGroups(rawGroups, teamSize);
  const splitGroups = splits.map((idxs) => ({
    riders: idxs.map((i) => `${riders[i].firstName} ${riders[i].lastName}`),
    teamSize,
  }));

  // Overall spread among estimated riders — sizes the "mixed-speed group" flag threshold below (roughly one cup's worth of range).
  const allEstimated = riders.map((r) => r.estimatedLapSeconds).filter((t): t is number => t != null);
  const overallSpread = allEstimated.length ? Math.max(...allEstimated) - Math.min(...allEstimated) : 0;
  const perCupRange = overallSpread / cups.length;

  const groups: Group[] = indexGroups.map((indices) => {
    const times = indices.map((i) => riders[i].estimatedLapSeconds).filter((t): t is number => t != null);
    const spread = times.length >= 2 ? Math.max(...times) - Math.min(...times) : 0;
    return {
      indices,
      avg: groupAverage(riders, indices),
      rank: times.length ? Math.max(...times) : null,
      seedSum: groupSeedSum(riders, indices),
      mixedSpeed: perCupRange > 0 && spread > perCupRange,
    };
  });

  // 2a. Cup pass: sorted slowest→fastest partition — cups are tiered heats, not interchangeable bins.
  const cupIndexByGroup = assignCupsToGroups(groups, cups.length, capacity);

  const riderCupIndex = new Array<number>(riders.length).fill(-1);
  groups.forEach((g, gi) => {
    for (const i of g.indices) riderCupIndex[i] = cupIndexByGroup[gi];
  });

  return { groups, cupIndexByGroup, riderCupIndex, unmatchedFriends, splitGroups };
}

/**
 * Build relay teams. Mutates each rider's `relay` field and returns the team
 * structure plus any unmatched friend requests / split groups for review.
 * Thin wrapper around {@link assignCups} (steps 1 + 2a) plus the within-cup
 * team pass (2b) and leg ordering (3).
 */
export function buildRelayTeams(riders: Rider[], config: RelayConfig): RelayResult {
  const { cups, characters, teamSize } = config;
  const { groups, cupIndexByGroup, unmatchedFriends, splitGroups } = assignCups(riders, config);

  // 2b. Team pass: within each cup, converge each character-team's average toward that cup's.
  const slots: RelaySlot[] = [];
  const slotIndexByCupCharacter = new Map<string, number>();
  for (const cup of cups) {
    for (const character of characters) {
      slotIndexByCupCharacter.set(`${cup}||${character}`, slots.length);
      slots.push({ cup, character, riders: [] });
    }
  }
  cups.forEach((cup, cupIdx) => {
    const groupsInCup = groups.map((g, idx) => ({ g, idx })).filter(({ idx }) => cupIndexByGroup[idx] === cupIdx);
    const teamBins: Bin[] = characters.map(() => ({ capacity: teamSize, count: 0, totalSeconds: 0, totalSeed: 0 }));
    placeGroupsLPT(
      groupsInCup.map(({ g }) => g),
      teamBins,
      (localIdx, characterIdx) => {
        const { g } = groupsInCup[localIdx];
        const slot = slots[slotIndexByCupCharacter.get(`${cup}||${characters[characterIdx]}`)!];
        for (const i of g.indices) slot.riders.push(riders[i]);
      },
    );
  });

  // 3. Assign leg order within each team and write back to riders.
  const teams = slots.filter((s) => s.riders.length > 0);
  for (const team of teams) {
    team.riders.sort(compareLegOrder);
    team.riders.forEach((r, leg) => {
      r.relay = { cup: team.cup, character: team.character, leg: leg + 1 };
    });
  }

  return { teams, unmatchedFriends, splitGroups };
}

/** Move a rider to a specific cup/character team, recomputing legs is left to a rebuild. */
export function reassignRelay(rider: Rider, cup: string, character: string): void {
  rider.relay = { cup, character, leg: rider.relay?.leg ?? 1 };
}
