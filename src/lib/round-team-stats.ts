export type RoundTeamStatsTeam = {
  id: string;
  name: string;
  position?: number | null;
  color?: string | null;
  crest_url?: string | null;
};

export type RoundTeamStatsMatch = {
  status: "pending" | "live" | "finished";
  team_a_id: string;
  team_b_id: string;
  score_a: number | null | undefined;
  score_b: number | null | undefined;
};

export type RoundTeamStat = RoundTeamStatsTeam & {
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

/**
 * Builds a round table directly from the scoreboard. Goals in a live match are
 * already useful in the summary, while results are only awarded after the
 * match is finished so the table never treats a temporary score as final.
 */
export function getRoundTeamStats(
  teams: RoundTeamStatsTeam[],
  matches: RoundTeamStatsMatch[],
): RoundTeamStat[] {
  const statsByTeamId = new Map<string, RoundTeamStat>(
    teams.map((team) => [team.id, { ...team, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }]),
  );

  for (const match of matches) {
    if (match.status === "pending") continue;

    const teamA = statsByTeamId.get(match.team_a_id);
    const teamB = statsByTeamId.get(match.team_b_id);
    if (!teamA || !teamB) continue;

    const scoreA = Number(match.score_a || 0);
    const scoreB = Number(match.score_b || 0);
    teamA.goalsFor += scoreA;
    teamA.goalsAgainst += scoreB;
    teamB.goalsFor += scoreB;
    teamB.goalsAgainst += scoreA;

    if (match.status === "finished") {
      if (scoreA > scoreB) {
        teamA.wins += 1;
        teamA.points += 3;
        teamB.losses += 1;
      } else if (scoreB > scoreA) {
        teamB.wins += 1;
        teamB.points += 3;
        teamA.losses += 1;
      } else {
        teamA.draws += 1;
        teamB.draws += 1;
        teamA.points += 1;
        teamB.points += 1;
      }
    }
  }

  return [...statsByTeamId.values()].sort((a, b) =>
    b.points - a.points
    || b.wins - a.wins
    || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
    || b.goalsFor - a.goalsFor
    || a.name.localeCompare(b.name, "pt-BR"),
  );
}
