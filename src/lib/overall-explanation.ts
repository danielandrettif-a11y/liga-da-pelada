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
  isGoalkeeper?: boolean;
  overall?: number | null;
};

const TRAIT_ROLE = {
  defensive: { role: "DEF", label: "DEF/VOL" },
  midfield: { role: "ALA_MEI", label: "ALA" },
  offensive: { role: "ATA", label: "ATA" },
} as const;

const RANKED_WEIGHTS: Record<number, number[]> = {
  1: [1],
  2: [0.7, 0.3],
  3: [0.6, 0.25, 0.15],
};

/**
 * Reproduz somente a composição final do OVR geral da fórmula v11.
 * Os pesos acompanham as características escolhidas pelo ADM e são aplicados
 * da maior para a menor nota selecionada.
 */
export function getOverallComposition(
  traits: PlayerProfile[] | null | undefined,
  positions: OverallPositionValues | null | undefined,
  options: OverallCompositionOptions = {},
) {
  if (!positions) return null;

  const uniqueTraits = [...new Set((traits || []).filter((trait) => trait in TRAIT_ROLE))].slice(0, 3);
  if (uniqueTraits.length === 0) return null;

  const weights = RANKED_WEIGHTS[uniqueTraits.length];
  const items = uniqueTraits
    .map((trait) => {
      const mapping = TRAIT_ROLE[trait];
      return {
        trait,
        role: mapping.role,
        label: mapping.label,
        value: positions[mapping.role],
      };
    })
    .sort((left, right) => right.value - left.value)
    .map((item, index): OverallCompositionItem => ({ ...item, weight: weights[index] }));

  const lineValue = Math.round(items.reduce((total, item) => total + item.value * item.weight, 0) * 10) / 10;
  const displayedOverall = options.overall;
  // As posições públicas têm uma casa decimal, então toleramos 0,1 de
  // arredondamento. Uma diferença maior, acompanhada de igualdade com GOL,
  // identifica com segurança quando a regra especial do goleiro assumiu o geral.
  const goalkeeperOverride = options.isGoalkeeper
    && typeof displayedOverall === "number"
    && Math.abs(displayedOverall - lineValue) > 0.11
    && Math.abs(displayedOverall - positions.GOL) <= 0.11;

  if (goalkeeperOverride) {
    return {
      source: "goalkeeper" as const,
      items: [{ trait: null, role: "GOL", label: "GOL", value: positions.GOL, weight: 1 }] satisfies OverallCompositionItem[],
      value: positions.GOL,
    };
  }

  return { source: "traits" as const, items, value: lineValue };
}
