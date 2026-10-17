import {
  DEFAULT_PLAYERS_PER_TEAM,
  MAX_PLAYERS_PER_TEAM,
  MAX_TEAMS_PER_ROUND,
  MIN_TEAMS_PER_ROUND,
  TEAMS_PER_ROUND,
} from "@/lib/constants";

export type OpenCallupRequest = {
  date: string;
  startTime: string;
  stadiumId: string | null;
  roundType: "friendly" | "official";
  requestedPlayersPerTeam: string | null;
  requestedTeamsPerRound: string | null;
};

export type OpenCallupFormat = {
  playersPerTeam: number;
  teamsPerRound: number;
  capacity: number;
};

export function parseOpenCallupRequest(input: {
  date: string;
  startTime: string | null;
  stadiumId: string | null;
  roundType: string | null;
  playersPerTeam: string | null;
  teamsPerRound: string | null;
}): OpenCallupRequest | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return null;
  return {
    date: input.date,
    startTime: (input.startTime || "08:00").slice(0, 5) || "08:00",
    stadiumId: input.stadiumId || null,
    roundType: input.roundType === "friendly" ? "friendly" : "official",
    requestedPlayersPerTeam: input.playersPerTeam || null,
    requestedTeamsPerRound: input.teamsPerRound || null,
  };
}

export function resolveOpenCallupFormat(
  request: OpenCallupRequest,
  defaults: { playersPerTeam: number | null; teamsPerRound: number | null },
): { format: OpenCallupFormat } | { error: string } {
  const defaultPlayersPerTeam = Math.min(MAX_PLAYERS_PER_TEAM, Math.max(1, defaults.playersPerTeam || DEFAULT_PLAYERS_PER_TEAM));
  const defaultTeamsPerRound = Math.min(MAX_TEAMS_PER_ROUND, Math.max(MIN_TEAMS_PER_ROUND, defaults.teamsPerRound || TEAMS_PER_ROUND));
  const playersPerTeam = Number(request.requestedPlayersPerTeam || defaultPlayersPerTeam);
  const teamsPerRound = Number(request.requestedTeamsPerRound || defaultTeamsPerRound);
  if (!Number.isInteger(playersPerTeam) || playersPerTeam < 5 || playersPerTeam > 7) {
    return { error: "Escolha 5, 6 ou 7 jogadores por time." };
  }
  if (!Number.isInteger(teamsPerRound) || teamsPerRound < MIN_TEAMS_PER_ROUND || teamsPerRound > MAX_TEAMS_PER_ROUND) {
    return { error: "Escolha de 2 a 6 times." };
  }
  return { format: { playersPerTeam, teamsPerRound, capacity: playersPerTeam * teamsPerRound } };
}
