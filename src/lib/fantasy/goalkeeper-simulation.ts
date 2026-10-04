export type FantasyGoalkeeperSimulationMatch = {
  status: "pending" | "live" | "finished";
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  players: Array<{ playerId: string; scoringEligible?: boolean }>;
  goalkeepers: Array<{ playerId: string; teamId: string }>;
  events: Array<{
    playerId: string;
    assistPlayerId?: string | null;
    isOwnGoal?: boolean;
  }>;
};

export type FantasyGoalkeeperSimulationStats = {
  goalkeeperGames: number;
  goalkeeperGoals: number;
  goalkeeperAssists: number;
  goalkeeperOwnGoals: number;
  goalkeeperWins: number;
  goalkeeperDraws: number;
  goalkeeperLosses: number;
  goalsConceded: number;
  cleanSheets: number;
};

/**
 * Reconstrói somente a simulação da vaga GOL a partir das partidas.
 * Não lê nem altera a pontuação oficial persistida da rodada.
 */
export function buildFantasyGoalkeeperSimulationStats(
  matches: FantasyGoalkeeperSimulationMatch[],
  playerId: string,
): FantasyGoalkeeperSimulationStats {
  const stats: FantasyGoalkeeperSimulationStats = {
    goalkeeperGames: 0,
    goalkeeperGoals: 0,
    goalkeeperAssists: 0,
    goalkeeperOwnGoals: 0,
    goalkeeperWins: 0,
    goalkeeperDraws: 0,
    goalkeeperLosses: 0,
    goalsConceded: 0,
    cleanSheets: 0,
  };

  for (const match of matches) {
    if (match.status === "pending") continue;
    const goalkeeper = match.goalkeepers.find((item) => item.playerId === playerId);
    if (!goalkeeper) continue;
    const participant = match.players.find((item) => item.playerId === playerId);
    if (participant?.scoringEligible === false) continue;

    const isTeamA = goalkeeper.teamId === match.teamAId;
    const isTeamB = goalkeeper.teamId === match.teamBId;
    if (!isTeamA && !isTeamB) continue;

    const goalsFor = isTeamA ? match.scoreA : match.scoreB;
    const goalsAgainst = isTeamA ? match.scoreB : match.scoreA;
    stats.goalkeeperGames += 1;
    stats.goalsConceded += goalsAgainst;

    for (const event of match.events) {
      if (event.playerId === playerId) {
        if (event.isOwnGoal) stats.goalkeeperOwnGoals += 1;
        else stats.goalkeeperGoals += 1;
      }
      if (event.assistPlayerId === playerId && !event.isOwnGoal) {
        stats.goalkeeperAssists += 1;
      }
    }

    if (match.status !== "finished") continue;
    if (goalsAgainst === 0) stats.cleanSheets += 1;
    if (goalsFor > goalsAgainst) stats.goalkeeperWins += 1;
    else if (goalsFor === goalsAgainst) stats.goalkeeperDraws += 1;
    else stats.goalkeeperLosses += 1;
  }

  return stats;
}
