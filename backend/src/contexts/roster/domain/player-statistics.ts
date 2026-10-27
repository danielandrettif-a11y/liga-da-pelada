import type { RosterPlayer } from "./player-catalog.js";

export type RosterRoundType = "official" | "friendly";

export type PlayerSeasonTotalsRecord = {
  playerId: string;
  rounds: unknown;
  games: unknown;
  goals: unknown;
  assists: unknown;
  wins: unknown;
  draws: unknown;
  losses: unknown;
  points: unknown;
  rankingPoints: unknown;
};

export type RosterPlayerStatistics = RosterPlayer & {
  rounds: number;
  games: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  legacyPoints: number;
  overall?: number;
  overallPositions?: { DEF: number; ALA_MEI: number; ATA: number; GOL: number } | null;
};

export type PlayerOverallRecord = {
  playerId: string;
  overall: unknown;
  defOverall: unknown;
  alaMeiOverall: unknown;
  ataOverall: unknown;
  golOverall: unknown;
};

export type RosterGroups = {
  officialPlayers: RosterPlayerStatistics[];
  activeGuests: RosterPlayerStatistics[];
  wags: RosterPlayerStatistics[];
  supporters: RosterPlayerStatistics[];
};

export class InvalidPlayerStatisticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlayerStatisticsError";
  }
}

export function parseRosterRoundType(value: string): RosterRoundType {
  if (value === "official" || value === "friendly") return value;
  throw new InvalidPlayerStatisticsError("Tipo de rodada inválido.");
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildRosterPlayerStatistics(
  players: readonly RosterPlayer[],
  rows: readonly PlayerSeasonTotalsRecord[],
  roundType: RosterRoundType,
): RosterPlayerStatistics[] {
  const totalsByPlayer = new Map(rows.map((row) => [row.playerId, row]));
  return players.map((player) => {
    const row = totalsByPlayer.get(player.id);
    const legacyPoints = numeric(row?.points);
    return {
      ...player,
      rounds: numeric(row?.rounds),
      games: numeric(row?.games),
      goals: numeric(row?.goals),
      assists: numeric(row?.assists),
      wins: numeric(row?.wins),
      draws: numeric(row?.draws),
      losses: numeric(row?.losses),
      points: roundType === "official" ? numeric(row?.rankingPoints ?? row?.points) : legacyPoints,
      legacyPoints,
    };
  }).sort((left, right) => right.points - left.points);
}

export function groupRosterPlayers(
  players: readonly RosterPlayerStatistics[], overalls: readonly PlayerOverallRecord[] = [],
): RosterGroups {
  const overallByPlayer = new Map(overalls.map((record) => [record.playerId, record]));
  const enriched = players.map((player): RosterPlayerStatistics => {
    if (player.member_category !== "player") return player;
    const record = overallByPlayer.get(player.id);
    if (!record || !Number.isFinite(Number(record.overall))) return player;
    const positionValues = {
      DEF: Number(record.defOverall),
      ALA_MEI: Number(record.alaMeiOverall),
      ATA: Number(record.ataOverall),
      GOL: Number(record.golOverall),
    };
    return {
      ...player,
      overall: Number(record.overall),
      overallPositions: Object.values(positionValues).every(Number.isFinite) ? positionValues : null,
    };
  });
  return {
    officialPlayers: enriched.filter((player) => player.member_category === "player"),
    activeGuests: enriched.filter((player) => player.member_category === "guest"),
    wags: enriched.filter((player) => player.member_category === "wag"),
    supporters: enriched.filter((player) => player.member_category === "supporter"),
  };
}
