export type RoundType = "official" | "friendly";

export type Season = {
  id: string;
  league_id: string;
  number: number;
  status: "active" | "finished";
  started_at: string;
  ended_at: string | null;
  stats_snapshot: SeasonSummary | null;
  created_at: string;
};

export type SeasonPlayerSummary = {
  id: string;
  name: string;
  nickname: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  points: number;
};

export type SeasonSummary = {
  seasonId: string;
  seasonNumber: number;
  leagueName: string;
  startedAt: string;
  endedAt: string;
  roundCount: number;
  matchCount: number;
  goalCount: number;
  playerCount: number;
  ranking: SeasonPlayerSummary[];
};

export type SeasonSummaryContext = {
  leagueName: string;
  season: Pick<Season, "id" | "number" | "started_at">;
  rounds: Array<{ id: string; status: string; roundType: RoundType }>;
  matches: Array<{ status: string; eventCount: number }>;
  participantIds: string[];
  stats: Array<SeasonPlayerSummary>;
};

export class SeasonRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeasonRuleError";
  }
}

export class SeasonValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeasonValidationError";
  }
}

export function parseRoundType(value: string): RoundType {
  if (value !== "official" && value !== "friendly") throw new SeasonValidationError("Tipo de rodada inválido.");
  return value;
}

export function assertFinishConfirmation(value: string): void {
  if (value !== "Terminar") throw new SeasonValidationError('Digite exatamente "Terminar" para confirmar.');
}

export function buildSeasonSummary(context: SeasonSummaryContext, endedAt: string): SeasonSummary {
  if (context.rounds.length === 0) {
    throw new SeasonRuleError("A temporada ainda não possui rodadas para arquivar.");
  }
  const unfinishedRounds = context.rounds.filter((round) => round.status !== "finished").length;
  if (unfinishedRounds > 0) {
    throw new SeasonRuleError(
      `Finalize ${unfinishedRounds === 1 ? "a rodada pendente" : `as ${unfinishedRounds} rodadas pendentes`} antes de terminar a temporada.`,
    );
  }
  const officialRounds = context.rounds.filter((round) => round.roundType === "official");
  if (officialRounds.length === 0) {
    throw new SeasonRuleError("A temporada ainda não possui rodadas oficiais para arquivar.");
  }
  const unfinishedMatches = context.matches.filter((match) => match.status !== "finished").length;
  if (unfinishedMatches > 0) {
    throw new SeasonRuleError(
      `Finalize ${unfinishedMatches === 1 ? "a partida pendente" : `as ${unfinishedMatches} partidas pendentes`} antes de terminar a temporada.`,
    );
  }

  const players = new Map<string, SeasonPlayerSummary>();
  for (const row of context.stats) {
    const current = players.get(row.id) || {
      id: row.id, name: row.name, nickname: row.nickname,
      games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, points: 0,
    };
    current.games += row.games;
    current.wins += row.wins;
    current.draws += row.draws;
    current.losses += row.losses;
    current.goals += row.goals;
    current.assists += row.assists;
    current.points += row.points;
    players.set(row.id, current);
  }
  const ranking = [...players.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.goals - a.goals;
  });

  return {
    seasonId: context.season.id,
    seasonNumber: context.season.number,
    leagueName: context.leagueName,
    startedAt: context.season.started_at,
    endedAt,
    roundCount: officialRounds.length,
    matchCount: context.matches.length,
    goalCount: context.matches.reduce((total, match) => total + match.eventCount, 0),
    playerCount: new Set(context.participantIds).size,
    ranking,
  };
}
