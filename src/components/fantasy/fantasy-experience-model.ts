import type { FantasyActiveCardDTO, FantasyPackDTO } from "@/lib/actions/fantasy-cards";
import type {
  FantasyDashboardInsights,
  FantasyLiveProjection,
  FantasyMarketPlayer,
  FantasyPublicMarketHealth,
  FantasyRadarData,
} from "@/lib/actions/fantasy";
import type { FantasyChallengeType } from "@/lib/fantasy/challenges";
import type { FantasySettings } from "@/lib/fantasy/config";
import { getFantasySlotRoles } from "@/lib/fantasy/lineup-positions";

export type FantasyExperienceProps = {
  round: { id: string; number: number; date: string; start_time: string | null; teams?: { id: string; name: string; color: string }[] } | null;
  fantasySeasonId: string;
  status: string;
  settings: FantasySettings;
  market: FantasyMarketPlayer[];
  budget: number;
  lineup: any;
  insights: FantasyDashboardInsights;
  radar?: FantasyRadarData;
  marketHealth?: FantasyPublicMarketHealth | null;
  account: { totalPoints: number; roundsPlayed: number; bestRoundPoints: number };
  isTest?: boolean;
  lastRound?: { number: number; date: string; playerPoints: number; cardPoints: number; totalPoints: number; playerScores: Array<{ playerId: string; points: number }> } | null;
  challengeType?: FantasyChallengeType | null;
  activeCard?: FantasyActiveCardDTO | null;
  availablePacks?: FantasyPackDTO[];
  availablePacksCount?: number;
  inventoryCount?: number;
  liveProjection?: FantasyLiveProjection;
  playersPerTeam?: number;
  initialPackId?: string;
  pitchAssetKey?: string | null;
};

export const positionLabel: Record<string, string> = {
  defensive: "Defesa",
  midfield: "Meio",
  offensive: "Ataque",
};

export function lineupPlayersFromSource(lineup: any) {
  return (lineup?.fantasy_lineup_players?.length
    ? lineup.fantasy_lineup_players
    : lineup?.fantasy_portfolio_players || []).filter((item: any) => Boolean(item?.player_id));
}

export function lineupFormationFromSlots(players: any[], playersPerTeam: number): "2-1-2" | "2-2-1" | null {
  const roles = Array(playersPerTeam).fill("");
  for (const item of players) {
    if (typeof item.slot_index === "number" && item.slot_index >= 0 && item.slot_index < playersPerTeam && typeof item.slot_role === "string") {
      roles[item.slot_index] = item.slot_role;
    }
  }
  if (!roles.some(Boolean)) return null;
  for (const candidate of ["2-1-2", "2-2-1"] as const) {
    const expected = getFantasySlotRoles(playersPerTeam, candidate);
    if (roles.every((role, index) => !role || role === expected[index])) return candidate;
  }
  return null;
}

export function lineupSignature({ ids, captain, scorer, assist, challenge, slotRoles }: {
  ids: Array<string | null | undefined>;
  captain: string | null | undefined;
  scorer: string | null | undefined;
  assist: string | null | undefined;
  challenge: string | null | undefined;
  slotRoles?: string[];
}) {
  return JSON.stringify({ ids: ids.filter(Boolean).sort(), captain: captain || null, scorer: scorer || null, assist: assist || null, challenge: challenge || null, slotRoles: slotRoles || null });
}
