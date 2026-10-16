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

export function parseAchievementBelts(value: unknown): PlayerAchievementBelt[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.flatMap((row): PlayerAchievementBelt[] => {
    if (!row || typeof row !== "object") return [];
    const source = row as Record<string, any>;
    if (!(["top_scorer", "top_assister", "team_win_streak"] as const).includes(source.slug)) return [];
    const team = source.team && typeof source.team === "object" ? source.team : null;
    return [{
      slug: source.slug,
      name: String(source.name || "Cinturão"),
      description: String(source.description || ""),
      recordValue: Number(source.recordValue || 0),
      unit: String(source.unit || "recorde"),
      scope: source.scope === "team" ? "team" : "player",
      roundId: source.roundId || null,
      roundNumber: source.roundNumber == null ? null : Number(source.roundNumber),
      roundDate: source.roundDate || null,
      team: team ? {
        id: String(team.id),
        name: String(team.name || "Time"),
        color: String(team.color || "#d4af37"),
        crestUrl: team.crestUrl || null,
        members: Array.isArray(team.members) ? team.members.map((member: any) => ({
          id: String(member.id),
          name: String(member.name || "Jogador"),
          avatarUrl: member.avatarUrl || null,
        })) : [],
      } : null,
    }];
  });
}
