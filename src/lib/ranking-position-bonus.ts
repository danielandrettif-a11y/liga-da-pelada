import { calculatePositionBonusValue, type PositionBreakdownInput } from "./fantasy/position-breakdown";
import type { PlayerProfile } from "./types";

export type RankingLineRole = "DEF" | "MEI" | "ATA";

export type RankingRoleWeight = {
  role: RankingLineRole;
  overall: number;
  weight: 1 | 0.5;
};

export type RankingPositionOveralls = {
  DEF: number;
  ALA_MEI: number;
  ATA: number;
};

const ROLE_ORDER: RankingLineRole[] = ["DEF", "MEI", "ATA"];

function profileRole(profile: PlayerProfile | null | undefined): RankingLineRole | null {
  if (profile === "defensive") return "DEF";
  if (profile === "midfield") return "MEI";
  if (profile === "offensive") return "ATA";
  return null;
}

export function resolveRankingRoleWeights(
  positions: RankingPositionOveralls,
  profile: PlayerProfile | null | undefined,
): RankingRoleWeight[] {
  const preferredRole = profileRole(profile);
  return [
    { role: "DEF" as const, overall: Number(positions.DEF) },
    { role: "MEI" as const, overall: Number(positions.ALA_MEI) },
    { role: "ATA" as const, overall: Number(positions.ATA) },
  ]
    .filter((item) => Number.isFinite(item.overall))
    .sort((a, b) => (
      b.overall - a.overall
      || Number(b.role === preferredRole) - Number(a.role === preferredRole)
      || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
    ))
    .slice(0, 2)
    .map((item, index) => ({ ...item, weight: index === 0 ? 1 : 0.5 }));
}

export function parseRankingRoleWeights(value: unknown): RankingRoleWeight[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RankingRoleWeight[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const role = row.role;
    const overall = Number(row.overall);
    const weight = Number(row.weight);
    if (!ROLE_ORDER.includes(role as RankingLineRole) || !Number.isFinite(overall) || (weight !== 1 && weight !== 0.5)) return [];
    return [{ role: role as RankingLineRole, overall, weight: weight as 1 | 0.5 }];
  }).slice(0, 2);
}

export type RankingPositionBonusInput = Omit<PositionBreakdownInput, "slotRole" | "playerProfile" | "scoringVersion"> & {
  roleWeights: RankingRoleWeight[];
};

export function calculateRankingPositionBonus(input: RankingPositionBonusInput): number {
  const bonus = input.roleWeights.reduce((total, roleWeight) => total + calculatePositionBonusValue({
    ...input,
    scoringVersion: 10,
    slotRole: roleWeight.role,
    playerProfile: roleWeight.role === "DEF" ? "defensive" : roleWeight.role === "MEI" ? "midfield" : "offensive",
  }) * roleWeight.weight, 0);
  return Math.round(bonus * 100) / 100;
}

export function rankingRoleWeightsLabel(weights: RankingRoleWeight[]) {
  return weights.map(({ role, weight }) => `${role === "MEI" ? "ALA" : role} ${weight === 1 ? "100%" : "50%"}`).join(" + ");
}
