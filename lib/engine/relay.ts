import type { RelayConfig, Rider } from "./models";

/**
 * Relay team builder (Swamp Dash Relay).
 *
 * Riders are distributed across the relay's cups (time-staggered heats) and, within
 * each cup, into character teams of ~teamSize. The builder:
 *   1. Groups riders who requested each other (friend requests) so they land on the
 *      same team — a keep-together constraint.
 *   2. Greedily distributes those groups across the cup × character slots to balance
 *      team sizes (and, secondarily, skill via seed level).
 *   3. Assigns a leg order (1..n) within each team.
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
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Candidate normalized name keys for a rider (handles "First Last" and "Last, First"). */
function nameKeys(r: Rider): string[] {
  const f = r.firstName?.trim() ?? "";
  const l = r.lastName?.trim() ?? "";
  return [norm(`${f} ${l}`), norm(`${l} ${f}`), norm(`${l}, ${f}`), norm(`${l} ,${f}`)].filter(Boolean);
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
 * Build relay teams. Mutates each rider's `relay` field and returns the team
 * structure plus any unmatched friend requests for review.
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
  const groups = [...groupsMap.values()].sort((a, b) => b.length - a.length);

  // 2. Build empty slots (cup × character), then greedily place groups.
  const slots: RelaySlot[] = [];
  for (const cup of cups) for (const character of characters) slots.push({ cup, character, riders: [] });

  const skillSum = (s: RelaySlot) => s.riders.reduce((n, r) => n + (r.seedLevel ?? 0), 0);
  const groupSkill = (idxs: number[]) => idxs.reduce((n, i) => n + (riders[i].seedLevel ?? 0), 0);

  for (const group of groups) {
    // Prefer a slot that still has room for the whole group; fall back to the emptiest.
    const fitting = slots.filter((s) => s.riders.length + group.length <= teamSize);
    const pool = fitting.length ? fitting : slots;
    pool.sort((a, b) => a.riders.length - b.riders.length || skillSum(a) - skillSum(b));
    const target = pool[0];
    for (const i of group) target.riders.push(riders[i]);
    void groupSkill; // skill considered via slot sort; kept for future weighting
  }

  // 3. Assign leg order within each team and write back to riders.
  const teams = slots.filter((s) => s.riders.length > 0);
  for (const team of teams) {
    team.riders.sort((a, b) => (a.seedLevel ?? 1e9) - (b.seedLevel ?? 1e9));
    team.riders.forEach((r, leg) => {
      r.relay = { cup: team.cup, character: team.character, leg: leg + 1 };
    });
  }

  return { teams, unmatchedFriends };
}

/** Move a rider to a specific cup/character team, recomputing legs is left to a rebuild. */
export function reassignRelay(rider: Rider, cup: string, character: string): void {
  rider.relay = { cup, character, leg: rider.relay?.leg ?? 1 };
}
