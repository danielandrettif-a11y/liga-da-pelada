export type MonthlyAwardType =
  | "bestDefenderMonth"
  | "bestMidfielderMonth"
  | "bestAttackerMonth"
  | "bestGoalkeeperMonth"
  | "goldenBootMonth"
  | "topAssistMonth"
  | "bestManagerMonth";

export type MonthlyAward = {
  type: MonthlyAwardType;
  periodStart: string;
  points: number;
  roundsPlayed: number;
  isFinal: boolean;
  metricValue?: number;
};

export type MonthlyAwardWinner = MonthlyAward & {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
};

export const MONTHLY_AWARD_LABELS: Record<MonthlyAwardType, string> = {
  bestDefenderMonth: "Melhor Defensor do mês",
  bestMidfielderMonth: "Melhor Ala/Meio do mês",
  bestAttackerMonth: "Melhor Atacante do mês",
  bestGoalkeeperMonth: "Melhor Goleiro do mês",
  goldenBootMonth: "Chuteira de Ouro",
  topAssistMonth: "Garçom do mês",
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
    return [{
      type: type as MonthlyAwardType,
      periodStart: row.period_start,
      points: Number(row.points || 0),
      roundsPlayed: Number(row.rounds_played || 0),
      isFinal: row.is_final === true,
      ...(metricValue === undefined ? {} : { metricValue }),
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
    return [{
      type: type as MonthlyAwardType,
      periodStart: row.period_start,
      points: Number(row.points || 0),
      roundsPlayed: Number(row.rounds_played || 0),
      isFinal: row.is_final === true,
      ...(metricValue === undefined ? {} : { metricValue }),
      playerId: row.player_id,
      playerName: row.player_name,
      avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    }];
  });
}

export function formatAwardPerformance(award: MonthlyAward) {
  const value = award.metricValue ?? award.points;
  if (award.type === "bestGoalkeeperMonth") {
    return `${value} ${value === 1 ? "gol sofrido" : "gols sofridos"}`;
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
