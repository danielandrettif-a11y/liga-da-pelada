import { calculateFantasyPlayerPoints } from "./engine";
import type { FantasySettings } from "./config";
import {
  calculateFantasyPositionPackageBonus,
  type FantasySlotRole,
} from "./lineup-positions";

export type FantasyLiveEvent = { playerId: string; assistPlayerId?: string | null; teamId: string; isOwnGoal?: boolean };
export type FantasyLiveMatchPlayer = {
  playerId: string;
  teamId: string;
  resultEligible: boolean;
  playerProfile?: "offensive" | "midfield" | "defensive" | null;
};
export type FantasyLiveGoalkeeper = { playerId: string; teamId: string };
export type FantasyLiveMatch = {
  id: string;
  status: "pending" | "live" | "finished";
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  players: readonly FantasyLiveMatchPlayer[];
  goalkeepers: readonly FantasyLiveGoalkeeper[];
  events: readonly FantasyLiveEvent[];
};

export type FantasyLivePlayerStats = {
  playerId: string;
  goals: number;
  assists: number;
  ownGoals: number;
  playerProfile?: "offensive" | "midfield" | "defensive" | null;
  wins: number;
  draws: number;
  losses: number;
  games: number;
  goalkeeperGames: number;
  goalsConceded: number;
  cleanSheets: number;
  defensiveCleanGames: number;
  defensiveOneGoalGames: number;
  teamGoalsConceded: number;
  basePoints: number;
};

export type FantasyLiveLineupInput = {
  id: string;
  userId: string;
  playerIds: string[];
  slots?: Array<{
    playerId: string;
    slotRole: FantasySlotRole;
    playerProfile?: FantasyLivePlayerStats["playerProfile"];
  }>;
  captainPlayerId?: string | null;
  topScorerPlayerId?: string | null;
  topAssistPlayerId?: string | null;
  topScorerReward?: number;
  topAssistReward?: number;
  cardBonus?: number;
};

export type FantasyLiveLineupProjection = {
  lineupId: string;
  userId: string;
  players: Array<{
    playerId: string;
    slotRole: FantasySlotRole | null;
    basePoints: number;
    positionBonus: number;
    captainBonus: number;
    totalPoints: number;
  }>;
  playerPoints: number;
  positionBonus: number;
  captainBonus: number;
  predictionPoints: number;
  cardPoints: number;
  totalPoints: number;
  provisional: true;
};

/**
 * Calcula a prévia da rodada sem persistir nada. Resultados (vitória/derrota)
 * só contam em partidas encerradas; gols, assistências e gols sofridos chegam
 * imediatamente pelos eventos e placar atuais.
 */
export function projectFantasyLiveStats(
  matches: FantasyLiveMatch[],
  settings: FantasySettings,
  options: { ignoreGoalkeeperStats?: boolean } = {},
): Map<string, FantasyLivePlayerStats> {
  const stats = new Map<string, Omit<FantasyLivePlayerStats, "basePoints">>();
  const ensure = (playerId: string, playerProfile?: FantasyLivePlayerStats["playerProfile"]) => {
    const existing = stats.get(playerId);
    if (existing) return existing;
    const next = {
      playerId,
      goals: 0,
      assists: 0,
      ownGoals: 0,
      playerProfile,
      wins: 0,
      draws: 0,
      losses: 0,
      games: 0,
      goalkeeperGames: 0,
      goalsConceded: 0,
      cleanSheets: 0,
      defensiveCleanGames: 0,
      defensiveOneGoalGames: 0,
      teamGoalsConceded: 0,
    };
    stats.set(playerId, next);
    return next;
  };

  for (const match of matches) {
    if (match.status === "pending") continue;
    const isFinished = match.status === "finished";
    const isDraw = match.scoreA === match.scoreB;
    const winner = isDraw ? null : match.scoreA > match.scoreB ? match.teamAId : match.teamBId;
    const goalkeeperIds = new Set(match.goalkeepers.map((goalkeeper) => goalkeeper.playerId));

    for (const participant of match.players) {
      if (!participant.resultEligible) continue;
      const current = ensure(participant.playerId, participant.playerProfile);
      const conceded = participant.teamId === match.teamAId ? match.scoreB : match.scoreA;
      current.teamGoalsConceded += conceded;
      if (participant.playerProfile === "defensive" && !goalkeeperIds.has(participant.playerId) && isFinished) {
        if (conceded === 0) current.defensiveCleanGames += 1;
        else if (conceded === 1) current.defensiveOneGoalGames += 1;
      }
      if (isFinished) {
        current.games += 1;
        if (isDraw) current.draws += 1;
        else if (winner === participant.teamId) current.wins += 1;
        else current.losses += 1;
      }
    }

    if (!options.ignoreGoalkeeperStats) {
      for (const goalkeeper of match.goalkeepers) {
        const current = ensure(goalkeeper.playerId);
        const conceded = goalkeeper.teamId === match.teamAId ? match.scoreB : match.scoreA;
        current.goalsConceded += conceded;
        // A aparição é mostrada ao vivo, mas pode ser retirada caso a partida seja desfeita.
        current.goalkeeperGames += 1;
        if (conceded === 0) current.cleanSheets += 1;
      }
    }

    for (const event of match.events) {
      if (event.isOwnGoal) {
        ensure(event.playerId).ownGoals += 1;
      } else {
        ensure(event.playerId).goals += 1;
        if (event.assistPlayerId) ensure(event.assistPlayerId).assists += 1;
      }
    }
  }

  return new Map(
    [...stats.entries()].map(([playerId, value]) => [
      playerId,
      {
        ...value,
        basePoints: calculateFantasyPlayerPoints(value, settings),
      },
    ]),
  );
}

export function projectFantasyLiveLineups(
  lineups: FantasyLiveLineupInput[],
  playerStats: Map<string, FantasyLivePlayerStats>,
  settings: FantasySettings,
  eligiblePredictionPlayerIds?: ReadonlySet<string>,
): FantasyLiveLineupProjection[] {
  const eligibleStats = [...playerStats.values()].filter(
    (item) => !eligiblePredictionPlayerIds || eligiblePredictionPlayerIds.has(item.playerId),
  );
  const topGoals = Math.max(0, ...eligibleStats.map((item) => item.goals));
  const topAssists = Math.max(0, ...eligibleStats.map((item) => item.assists));

  return lineups.map((lineup) => {
    const slotByPlayer = new Map((lineup.slots || []).map((slot) => [slot.playerId, slot]));
    const pointsByPlayer = new Map<string, number>();
    let positionBonus = 0;

    for (const playerId of lineup.playerIds) {
      const stats = playerStats.get(playerId);
      const slot = slotByPlayer.get(playerId);
      const bonus = stats && slot
        ? calculateFantasyPositionPackageBonus(
            {
              slotRole: slot.slotRole,
              playerProfile: slot.playerProfile ?? stats.playerProfile,
              goals: stats.goals,
              assists: stats.assists,
              games: stats.games,
              losses: stats.losses,
              goalkeeperGames: stats.goalkeeperGames,
              goalsConceded: stats.goalsConceded,
              cleanSheets: stats.cleanSheets,
              defensiveCleanGames: stats.defensiveCleanGames,
              defensiveOneGoalGames: stats.defensiveOneGoalGames,
            },
            settings,
          )
        : 0;
      positionBonus += bonus;
      pointsByPlayer.set(playerId, (stats?.basePoints || 0) + bonus);
    }

    const playerPoints = [...pointsByPlayer.values()].reduce((sum, points) => sum + points, 0);
    const captainBase = lineup.captainPlayerId ? pointsByPlayer.get(lineup.captainPlayerId) || 0 : 0;
    const captainBonus = Math.round(captainBase * Math.max(0, settings.captainMultiplier - 1) * 100) / 100;
    const players = lineup.playerIds.map((playerId) => {
      const slot = slotByPlayer.get(playerId);
      const basePoints = playerStats.get(playerId)?.basePoints || 0;
      const totalWithoutCaptain = pointsByPlayer.get(playerId) || 0;
      const positionBonus = totalWithoutCaptain - basePoints;
      const playerCaptainBonus = playerId === lineup.captainPlayerId
        ? Math.round(totalWithoutCaptain * Math.max(0, settings.captainMultiplier - 1) * 100) / 100
        : 0;
      return {
        playerId,
        slotRole: slot?.slotRole || null,
        basePoints,
        positionBonus,
        captainBonus: playerCaptainBonus,
        totalPoints: totalWithoutCaptain + playerCaptainBonus,
      };
    });
    const scorerHit = Boolean(
      lineup.topScorerPlayerId &&
      (!eligiblePredictionPlayerIds || eligiblePredictionPlayerIds.has(lineup.topScorerPlayerId)) &&
      topGoals > 0 && playerStats.get(lineup.topScorerPlayerId)?.goals === topGoals,
    );
    const assistHit = Boolean(
      lineup.topAssistPlayerId &&
      (!eligiblePredictionPlayerIds || eligiblePredictionPlayerIds.has(lineup.topAssistPlayerId)) &&
      topAssists > 0 && playerStats.get(lineup.topAssistPlayerId)?.assists === topAssists,
    );
    const predictionPoints =
      (scorerHit ? lineup.topScorerReward ?? settings.topScorerPredictionPoints : 0) +
      (assistHit ? lineup.topAssistReward ?? settings.topAssistPredictionPoints : 0);
    const cardPoints = lineup.cardBonus || 0;
    return {
      lineupId: lineup.id,
      userId: lineup.userId,
      players,
      playerPoints,
      positionBonus,
      captainBonus,
      predictionPoints,
      cardPoints,
      totalPoints: playerPoints + captainBonus + predictionPoints + cardPoints,
      provisional: true,
    };
  });
}
