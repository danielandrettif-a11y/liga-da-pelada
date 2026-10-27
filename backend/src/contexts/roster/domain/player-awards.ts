export type MonthlyAwardType =
  | "bestDefenderMonth" | "bestAttackerMonth" | "bestGoalkeeperMonth"
  | "goldenBootMonth" | "topAssistMonth" | "rankedMvpMonth" | "bestManagerMonth";

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

export type PlayerAchievementBelt = {
  slug: "top_scorer" | "top_assister" | "team_win_streak";
  name: string;
  description: string;
  recordValue: number;
  unit: string;
  scope: "player" | "team";
  roundId: string | null;
  roundNumber: number | null;
  roundDate: string | null;
  team: {
    id: string;
    name: string;
    color: string;
    crestUrl: string | null;
    members: Array<{ id: string; name: string; avatarUrl: string | null }>;
  } | null;
};

const awardTypes = new Set<MonthlyAwardType>([
  "bestDefenderMonth", "bestAttackerMonth", "bestGoalkeeperMonth", "goldenBootMonth",
  "topAssistMonth", "rankedMvpMonth", "bestManagerMonth",
]);
const beltSlugs = new Set<PlayerAchievementBelt["slug"]>(["top_scorer", "top_assister", "team_win_streak"]);

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateText(value: unknown): string | null {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
}

function monthlyAward(value: unknown): MonthlyAward | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const type = String(row.award_type || "") as MonthlyAwardType;
  const periodStart = dateText(row.period_start);
  if (!awardTypes.has(type) || !periodStart) return null;
  const metricValue = optionalNumber(row.metric_value);
  const goalkeeperGames = optionalNumber(row.goalkeeper_games);
  const goalsConceded = optionalNumber(row.goals_conceded);
  const cleanSheets = optionalNumber(row.clean_sheets);
  return {
    type, periodStart, points: optionalNumber(row.points) ?? 0,
    roundsPlayed: optionalNumber(row.rounds_played) ?? 0, isFinal: row.is_final === true,
    ...(metricValue === undefined ? {} : { metricValue }),
    ...(goalkeeperGames === undefined ? {} : { goalkeeperGames }),
    ...(goalsConceded === undefined ? {} : { goalsConceded }),
    ...(cleanSheets === undefined ? {} : { cleanSheets }),
  };
}

export function monthlyAwardsFromRows(value: unknown): MonthlyAward[] {
  return Array.isArray(value) ? value.flatMap((row) => {
    const award = monthlyAward(row);
    return award ? [award] : [];
  }) : [];
}

export function monthlyAwardWinnersFromRows(value: unknown): MonthlyAwardWinner[] {
  return Array.isArray(value) ? value.flatMap((row) => {
    const award = monthlyAward(row);
    if (!award || !row || typeof row !== "object") return [];
    const source = row as Record<string, unknown>;
    if (typeof source.player_id !== "string" || typeof source.player_name !== "string") return [];
    return [{ ...award, playerId: source.player_id, playerName: source.player_name,
      avatarUrl: typeof source.avatar_url === "string" ? source.avatar_url : null }];
  }) : [];
}

export function achievementBeltsFromJson(value: unknown): PlayerAchievementBelt[] {
  return Array.isArray(value) ? value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const source = row as Record<string, unknown>;
    const slug = source.slug as PlayerAchievementBelt["slug"];
    if (!beltSlugs.has(slug)) return [];
    const rawTeam = source.team && typeof source.team === "object" ? source.team as Record<string, unknown> : null;
    const rawMembers = rawTeam && Array.isArray(rawTeam.members) ? rawTeam.members : [];
    return [{
      slug, name: String(source.name || "Cinturão"), description: String(source.description || ""),
      recordValue: optionalNumber(source.recordValue) ?? 0, unit: String(source.unit || "recorde"),
      scope: source.scope === "team" ? "team" : "player",
      roundId: typeof source.roundId === "string" ? source.roundId : null,
      roundNumber: optionalNumber(source.roundNumber) ?? null, roundDate: dateText(source.roundDate),
      team: rawTeam ? {
        id: String(rawTeam.id), name: String(rawTeam.name || "Time"), color: String(rawTeam.color || "#d4af37"),
        crestUrl: typeof rawTeam.crestUrl === "string" ? rawTeam.crestUrl : null,
        members: rawMembers.flatMap((member) => {
          if (!member || typeof member !== "object") return [];
          const item = member as Record<string, unknown>;
          return [{ id: String(item.id), name: String(item.name || "Jogador"),
            avatarUrl: typeof item.avatarUrl === "string" ? item.avatarUrl : null }];
        }),
      } : null,
    }];
  }) : [];
}

export function parseAwardPeriod(value: string): string {
  if (!/^\d{4}-\d{2}-01$/.test(value)) throw new Error("Período mensal inválido.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Período mensal inválido.");
  }
  return value;
}
