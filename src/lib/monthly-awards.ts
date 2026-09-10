export type MonthlyAwardType =
  | "bestDefenderMonth"
  | "bestMidfielderMonth"
  | "bestAttackerMonth"
  | "bestManagerMonth";

export type MonthlyAward = {
  type: MonthlyAwardType;
  periodStart: string;
  points: number;
  roundsPlayed: number;
  isFinal: boolean;
};

export const MONTHLY_AWARD_LABELS: Record<MonthlyAwardType, string> = {
  bestDefenderMonth: "Melhor DEF do mês",
  bestMidfielderMonth: "Melhor MEI do mês",
  bestAttackerMonth: "Melhor ATA do mês",
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
    return [{
      type: type as MonthlyAwardType,
      periodStart: row.period_start,
      points: Number(row.points || 0),
      roundsPlayed: Number(row.rounds_played || 0),
      isFinal: row.is_final === true,
    }];
  });
}

export function formatAwardMonth(periodStart: string) {
  const [year, month] = periodStart.split("-").map(Number);
  if (!year || !month) return periodStart;
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
