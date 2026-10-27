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
const nullableString = (value: unknown) => value === null || typeof value === "string";
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const optionalFinite = (value: unknown) => value === undefined || finite(value);

export function isMonthlyAward(value: unknown): value is MonthlyAward {
  if (!value || typeof value !== "object") return false;
  const award = value as Record<string, unknown>;
  return awardTypes.has(award.type as MonthlyAwardType) && typeof award.periodStart === "string"
    && finite(award.points) && finite(award.roundsPlayed) && typeof award.isFinal === "boolean"
    && optionalFinite(award.metricValue) && optionalFinite(award.goalkeeperGames)
    && optionalFinite(award.goalsConceded) && optionalFinite(award.cleanSheets);
}

export function isMonthlyAwardWinner(value: unknown): value is MonthlyAwardWinner {
  if (!isMonthlyAward(value)) return false;
  const winner = value as unknown as Record<string, unknown>;
  return typeof winner.playerId === "string" && typeof winner.playerName === "string"
    && nullableString(winner.avatarUrl);
}

function isBeltMember(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const member = value as Record<string, unknown>;
  return typeof member.id === "string" && typeof member.name === "string" && nullableString(member.avatarUrl);
}

export function isPlayerAchievementBelt(value: unknown): value is PlayerAchievementBelt {
  if (!value || typeof value !== "object") return false;
  const belt = value as Record<string, unknown>;
  if (!beltSlugs.has(belt.slug as PlayerAchievementBelt["slug"]) || typeof belt.name !== "string"
    || typeof belt.description !== "string" || !finite(belt.recordValue) || typeof belt.unit !== "string"
    || (belt.scope !== "player" && belt.scope !== "team") || !nullableString(belt.roundId)
    || !(belt.roundNumber === null || finite(belt.roundNumber)) || !nullableString(belt.roundDate)) return false;
  if (belt.team === null) return true;
  if (!belt.team || typeof belt.team !== "object") return false;
  const team = belt.team as Record<string, unknown>;
  return typeof team.id === "string" && typeof team.name === "string" && typeof team.color === "string"
    && nullableString(team.crestUrl) && Array.isArray(team.members) && team.members.every(isBeltMember);
}
