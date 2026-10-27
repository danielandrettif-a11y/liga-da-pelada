export type PlayerPlaytime = {
  totalSeconds: number;
  officialSeconds: number;
  friendlySeconds: number;
};

export type PlayerClubGoals = {
  key: string;
  name: string;
  color: string;
  crestUrl: string | null;
  officialGoals: number;
  friendlyGoals: number;
  totalGoals: number;
};

function nonNegativeNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isPlayerPlaytime(value: unknown): value is PlayerPlaytime {
  if (!value || typeof value !== "object") return false;
  const playtime = value as Record<string, unknown>;
  return nonNegativeNumber(playtime.totalSeconds)
    && nonNegativeNumber(playtime.officialSeconds)
    && nonNegativeNumber(playtime.friendlySeconds);
}

export function isPlayerClubGoals(value: unknown): value is PlayerClubGoals {
  if (!value || typeof value !== "object") return false;
  const club = value as Record<string, unknown>;
  return typeof club.key === "string" && typeof club.name === "string" && typeof club.color === "string"
    && (club.crestUrl === null || typeof club.crestUrl === "string")
    && nonNegativeNumber(club.officialGoals) && nonNegativeNumber(club.friendlyGoals)
    && nonNegativeNumber(club.totalGoals);
}
