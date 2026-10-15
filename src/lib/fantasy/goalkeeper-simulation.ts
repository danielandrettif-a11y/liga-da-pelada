import { calculateGoalkeeperMatchScouts, type GoalkeeperTimelineStint } from "../goalkeeper-timeline";

export type FantasyGoalkeeperSimulationMatch = {
  status: "pending" | "live" | "finished";
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  players: Array<{ playerId: string; scoringEligible?: boolean }>;
  goalkeepers: Array<{ playerId: string; teamId: string }>;
  goalkeeperStints?: GoalkeeperTimelineStint[];
  officialElapsedSeconds?: number;
  durationSeconds?: number;
  events: Array<{
    playerId: string;
    assistPlayerId?: string | null;
    teamId: string;
    isOwnGoal?: boolean;
    goalkeeperAPlayerId?: string | null;
    goalkeeperBPlayerId?: string | null;
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
    const goalkeeper = calculateGoalkeeperMatchScouts(match).get(playerId);
    if (!goalkeeper) continue;
    const participant = match.players.find((item) => item.playerId === playerId);
    if (participant?.scoringEligible === false) continue;
    stats.goalkeeperGames += goalkeeper.goalkeeperGames;
    stats.goalsConceded += goalkeeper.goalsConceded;
    stats.cleanSheets += goalkeeper.cleanSheets;
    stats.goalkeeperGoals += goalkeeper.goalkeeperGoals;
    stats.goalkeeperAssists += goalkeeper.goalkeeperAssists;
    stats.goalkeeperOwnGoals += goalkeeper.goalkeeperOwnGoals;
    stats.goalkeeperWins += goalkeeper.goalkeeperWins;
    stats.goalkeeperDraws += goalkeeper.goalkeeperDraws;
    stats.goalkeeperLosses += goalkeeper.goalkeeperLosses;
  }

  return stats;
}
