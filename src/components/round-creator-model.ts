import type { Player, RoundType, Stadium } from "@/lib/types";
import { TEAM_PRESETS } from "@/lib/teamPresets";

export type DrawPlayer = Player & { points?: number; rounds?: number; games?: number };
export type DrawTeam = { id: string; name: string; color: string; crestUrl: string | null; players: DrawPlayer[] };

export type RoundCreatorProps = {
  allPlayers: DrawPlayer[];
  stadiums?: Stadium[];
  initialDate?: string;
  initialPlayerIds?: string[];
  roundType?: RoundType;
  callupId?: string | null;
  prelistRoundId?: string | null;
  initialTime?: string;
  initialStadiumId?: string | null;
  availableCallups?: Array<{ id: string; date: string; startTime: string; roundType: RoundType; capacity: number; playerIds: string[]; entryIds: string[] }>;
  mountTeams?: boolean;
  prelistNumber?: number | null;
  playersPerTeam?: number;
  teamsPerRound?: number;
  teamPresetOffsets?: Partial<Record<RoundType, number>>;
};

export function createDefaultTeams(count: number, offset = 0): DrawTeam[] {
  const featuredTeams = TEAM_PRESETS.slice(0, 4);
  const normalizedOffset = ((offset % featuredTeams.length) + featuredTeams.length) % featuredTeams.length;
  const rotatedFeatured = [...featuredTeams.slice(normalizedOffset), ...featuredTeams.slice(0, normalizedOffset)];
  return [...rotatedFeatured, ...TEAM_PRESETS.slice(4)].slice(0, count).map((team, index) => ({
    id: `team${index + 1}`,
    ...team,
    players: [],
  }));
}
