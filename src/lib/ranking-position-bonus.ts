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
const ROLE_BONUS_CAP: Record<RankingLineRole, number> = { DEF: 10, MEI: 6, ATA: 2 };
export const RANKING_POSITION_TARGET_CAP: Record<RankingLineRole, number> = { DEF: 10, MEI: 8, ATA: 7 };

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
    .slice(0, 1)
    .map((item) => ({ ...item, weight: 1 as const }));
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
  const primary = input.roleWeights.find(({ weight }) => weight === 1);
  if (!primary) return 0;
  const bonus = calculatePositionBonusValue({
    ...input,
    scoringVersion: 11,
    slotRole: primary.role,
    playerProfile: primary.role === "DEF" ? "defensive" : primary.role === "MEI" ? "midfield" : "offensive",
  });
  return Math.round((bonus * RANKING_POSITION_TARGET_CAP[primary.role] / ROLE_BONUS_CAP[primary.role]) * 100) / 100;
}

export function rankingRoleWeightsLabel(weights: RankingRoleWeight[]) {
  const primary = weights.find(({ weight }) => weight === 1);
  return primary ? `${primary.role === "MEI" ? "ALA" : primary.role} · teto ${RANKING_POSITION_TARGET_CAP[primary.role]}` : "sem posição";
}
