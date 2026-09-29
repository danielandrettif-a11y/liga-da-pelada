export type MonthlyAwardType =
  | "bestDefenderMonth"
  | "bestMidfielderMonth"
  | "bestAttackerMonth"
  | "bestGoalkeeperMonth"
  | "goldenBootMonth"
  | "topAssistMonth"
  | "rankedMvpMonth"
  | "bestManagerMonth";

export type MonthlyAward = {
  type: MonthlyAwardType;
  periodStart: string;
  points: number;
  roundsPlayed: number;
  isFinal: boolean;
  metricValue?: number;
  goalkeeperGames?: number;
  goalsConceded?: number;
  cleanSheets?: number;
};

export type MonthlyAwardWinner = MonthlyAward & {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
};

export const MONTHLY_AWARD_LABELS: Record<MonthlyAwardType, string> = {
  bestDefenderMonth: "Melhor Defensor/Volante do mês",
  bestMidfielderMonth: "Melhor Ala do mês",
  bestAttackerMonth: "Melhor Atacante do mês",
  bestGoalkeeperMonth: "Melhor Goleiro do mês",
  goldenBootMonth: "Chuteira de Ouro",
  topAssistMonth: "Garçom do mês",
  rankedMvpMonth: "Craque do mês",
  bestManagerMonth: "Melhor Técnico do mês",
};

const MONTHLY_AWARD_TYPES = new Set(Object.keys(MONTHLY_AWARD_LABELS));

export function parseMonthlyAwards(rows: unknown): MonthlyAward[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const type = String(row.award_type || "");
    if (!MONTHLY_AWARD_TYPES.has(type) || typeof row.period_start !== "string") return [];
    const metricValue = row.metric_value == null ? undefined : Number(row.metric_value);
    const goalkeeperGames = row.goalkeeper_games == null ? undefined : Number(row.goalkeeper_games);
    const goalsConceded = row.goals_conceded == null ? undefined : Number(row.goals_conceded);
    const cleanSheets = row.clean_sheets == null ? undefined : Number(row.clean_sheets);
    return [{
      type: type as MonthlyAwardType,
      periodStart: row.period_start,
      points: Number(row.points || 0),
      roundsPlayed: Number(row.rounds_played || 0),
      isFinal: row.is_final === true,
      ...(metricValue === undefined ? {} : { metricValue }),
      ...(goalkeeperGames === undefined ? {} : { goalkeeperGames }),
      ...(goalsConceded === undefined ? {} : { goalsConceded }),
      ...(cleanSheets === undefined ? {} : { cleanSheets }),
    }];
  });
}

export function parseMonthlyAwardWinners(rows: unknown): MonthlyAwardWinner[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const type = String(row.award_type || "");
    if (
      !MONTHLY_AWARD_TYPES.has(type)
      || typeof row.period_start !== "string"
      || typeof row.player_id !== "string"
      || typeof row.player_name !== "string"
    ) return [];
    const metricValue = row.metric_value == null ? undefined : Number(row.metric_value);
    const goalkeeperGames = row.goalkeeper_games == null ? undefined : Number(row.goalkeeper_games);
    const goalsConceded = row.goals_conceded == null ? undefined : Number(row.goals_conceded);
    const cleanSheets = row.clean_sheets == null ? undefined : Number(row.clean_sheets);
    return [{
      type: type as MonthlyAwardType,
      periodStart: row.period_start,
      points: Number(row.points || 0),
      roundsPlayed: Number(row.rounds_played || 0),
      isFinal: row.is_final === true,
      ...(metricValue === undefined ? {} : { metricValue }),
      ...(goalkeeperGames === undefined ? {} : { goalkeeperGames }),
      ...(goalsConceded === undefined ? {} : { goalsConceded }),
      ...(cleanSheets === undefined ? {} : { cleanSheets }),
      playerId: row.player_id,
      playerName: row.player_name,
      avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    }];
  });
}

export function formatAwardPerformance(award: MonthlyAward) {
  const value = award.metricValue ?? award.points;
  if (award.type === "bestGoalkeeperMonth") {
    return `${value.toFixed(2).replace(".", ",")} gols por jogo`;
  }
  if (award.type === "goldenBootMonth") {
    return `${value} ${value === 1 ? "gol" : "gols"}`;
  }
  if (award.type === "topAssistMonth") {
    return `${value} ${value === 1 ? "assistência" : "assistências"}`;
  }
  return `${award.points.toFixed(1)} pts`;
}

export function previousMonthStart(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(referenceDate);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return new Date(Date.UTC(year, month - 2, 1))
    .toISOString()
    .slice(0, 10);
}

export function formatAwardMonth(periodStart: string) {
  const [year, month] = periodStart.split("-").map(Number);
  if (!year || !month) return periodStart;
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
