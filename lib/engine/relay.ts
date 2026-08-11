import type { RelayConfig, Rider } from "./models";
import { normName, nameKeys as nameKeysOf } from "./nameMatch";

/**
 * Relay team builder (Swamp Dash Relay).
 *
 * Riders are distributed across the relay's cups (time-staggered heats) and, within
 * each cup, into character teams of ~teamSize. The builder:
 *   1. Groups riders who requested each other (friend requests) so they land on the
 *      same team — a keep-together constraint. Groups larger than a team are split
 *      into team-sized chunks (flagged, not silently overflowed).
 *   2. Greedily distributes those groups across cup, then character, slots to
 *      converge each cup's average estimated Swamp Dash lap time (see
 *      lib/engine/history.ts) toward the overall mean, and each team's average
 *      toward its own cup's — a standard longest-first (LPT) load-balance greedy.
 *      Riders with no estimate (or when nobody has one at all) fall back to
 *      balancing by count, so team-building still works with zero history data.
 *   3. Assigns a leg order (1..n) within each team, slowest-estimated first,
 *      falling back to GBP seed level, then registration order.
 * Directors rebalance individual riders in the UI afterward.
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

interface Group {
  indices: number[];
  /** Average estimatedLapSeconds across riders in the group that have one; null if none do. */
  avg: number | null;
  /** Fallback signal used only when `avg` is null — see groupSeedSum. */
  seedSum: number;
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
 * Build relay teams. Mutates each rider's `relay` field and returns the team
 * structure plus any unmatched friend requests / split groups for review.
 */
export function buildRelayTeams(riders: Rider[], config: RelayConfig): RelayResult {
  const { cups, characters, teamSize } = config;
  const friendField = config.friendRequestField;

  // 1. Friend groups via union-find.
  const dsu = new DSU(riders.length);
  const byName = new Map<string, number>();
  riders.forEach((r, i) => {
    for (const k of nameKeys(r)) if (!byName.has(k)) byName.set(k, i);
  });
  const unmatchedFriends: { rider: string; requested: string }[] = [];
  if (friendField) {
    riders.forEach((r, i) => {
      const req = r.custom?.[friendField];
      if (!req) return;
      const target = byName.get(norm(req));
      if (target !== undefined && target !== i) dsu.union(i, target);
      else if (target === undefined) {
        unmatchedFriends.push({ rider: `${r.firstName} ${r.lastName}`, requested: req });
      }
    });
  }

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
  const groups: Group[] = indexGroups.map((indices) => ({
    indices,
    avg: groupAverage(riders, indices),
    seedSum: groupSeedSum(riders, indices),
  }));

  // 2a. Cup pass: converge each cup's average toward the overall mean.
  const cupBins: Bin[] = cups.map(() => ({ capacity: teamSize * characters.length, count: 0, totalSeconds: 0, totalSeed: 0 }));
  const groupCup = new Array<number>(groups.length).fill(0);
  placeGroupsLPT(groups, cupBins, (groupIdx, cupIdx) => {
    groupCup[groupIdx] = cupIdx;
  });

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
    const groupsInCup = groups.map((g, idx) => ({ g, idx })).filter(({ idx }) => groupCup[idx] === cupIdx);
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
