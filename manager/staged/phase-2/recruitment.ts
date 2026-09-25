import type { AthleteSource } from "@/lib/bq-manager/types";
import { FORMATION } from "./balance";

/** Bipartite matching: distinct athletes must cover 1 GK, 2 DEF, 2 ALA and 1 ATA.
 * Selected tutorial athletes are matched first, and can never be dropped.
 * Augmenting paths can move a versatile athlete to free a specialist's slot.
 */
export function canCompleteTutorial(selected: AthleteSource[], pool: AthleteSource[]): boolean {
  if (selected.length > 6 || new Set(selected.map(p => p.playerId)).size !== selected.length) return false;
  const all = [...new Map([...selected, ...pool].map(p => [p.playerId, p])).values()];
  // Preserve the frozen characteristics of existing cards over fresh app data.
  for (const source of selected) all[all.findIndex(p => p.playerId === source.playerId)] = source;
  const slots: (AthleteSource | undefined)[] = Array(6).fill(undefined);
  const fits = (source: AthleteSource, slot: number) => {
    const role = FORMATION[slot];
    return role === "GOL" ? source.goalkeeperEligible
      : source.traits.includes(({ DEF: "defensive", ALA_MEI: "midfield", ATA: "offensive" } as const)[role]);
  };
  function place(source: AthleteSource, visited: Set<number>): boolean {
    for (let i = 0; i < slots.length; i++) {
      if (!fits(source, i) || visited.has(i)) continue;
      visited.add(i);
      if (!slots[i] || place(slots[i]!, visited)) { slots[i] = source; return true; }
    }
    return false;
  }
  for (const source of selected) if (!place(source, new Set())) return false;
  for (const source of all.filter(p => !selected.some(item => item.playerId === p.playerId))) place(source, new Set());
  return slots.every(Boolean);
}

/** Only offer choices that still allow all six tutorial positions to be filled. */
export function tutorialCandidates(selected: AthleteSource[], pool: AthleteSource[]): AthleteSource[] {
  return pool.filter(candidate => !selected.some(p => p.playerId === candidate.playerId)
    && canCompleteTutorial([...selected, candidate], pool));
}
