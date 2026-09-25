import type { PlayerProfile } from "./types";

export type OverallPositionValues = {
  DEF: number;
  ALA_MEI: number;
  ATA: number;
  GOL: number;
};

export type OverallCompositionItem = {
  trait: PlayerProfile | null;
  role: "DEF" | "ALA_MEI" | "ATA" | "GOL";
  label: "DEF/VOL" | "ALA" | "ATA" | "GOL";
  value: number;
  weight: number;
};

type OverallCompositionOptions = {
  goalkeeperGames?: number;
};

const ROLE_LABELS = { DEF: "DEF/VOL", ALA_MEI: "ALA", ATA: "ATA", GOL: "GOL" } as const;
const RANKED_WEIGHTS = [0.5, 0.35, 0.15] as const;

/**
 * Reproduz a composição final do OVR geral da fórmula v12.
 * Usa as três maiores posições; GOL só entra após oito jogos reais no gol.
 */
export function getOverallComposition(
  _traits: PlayerProfile[] | null | undefined,
  positions: OverallPositionValues | null | undefined,
  options: OverallCompositionOptions = {},
) {
  if (!positions) return null;

  const eligibleRoles: Array<keyof OverallPositionValues> = ["DEF", "ALA_MEI", "ATA"];
  if (Number(options.goalkeeperGames || 0) >= 8) eligibleRoles.push("GOL");
  const items = eligibleRoles
    .map((role) => ({ trait: null, role, label: ROLE_LABELS[role], value: positions[role] }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 3)
    .map((item, index): OverallCompositionItem => ({ ...item, weight: RANKED_WEIGHTS[index] }));
  const value = Math.round(items.reduce((total, item) => total + item.value * item.weight, 0) * 10) / 10;
  return { source: "positions" as const, items, value };
}
