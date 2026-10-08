import { calculateFantasyGoalkeeperSlotPoints, calculateFantasyPlayerPoints, calculateFantasyRankedPoints, calculateFantasySlotPoints } from "./engine";
import { applyCaptainMultiplier } from "../bq-scoring";
import type { FantasySettings } from "./config";
import {
  calculateFantasyPositionPackageBonus,
  type FantasySlotRole,
} from "./lineup-positions";
import { resolveFantasyReserveSubstitution, type FantasyReserveRole } from "./reserve";

export type FantasyLiveEvent = { playerId: string; assistPlayerId?: string | null; teamId: string; isOwnGoal?: boolean };
export type FantasyLiveMatchPlayer = {
  playerId: string;
  teamId: string;
  resultEligible: boolean;
  scoringEligible?: boolean;
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
  goalkeeperGoals: number;
  goalkeeperAssists: number;
  goalkeeperOwnGoals: number;
  goalkeeperWins: number;
  goalkeeperDraws: number;
  goalkeeperLosses: number;
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
  reserve?: {
    playerId: string;
    slotRole: FantasyReserveRole;
  } | null;
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
  reserve: {
    playerId: string;
    slotRole: FantasyReserveRole;
    basePoints: number;
    applied: boolean;
    replacedPlayerId: string | null;
    replacedPlayerPoints: number;
    reservePoints: number;
    reserveTotalPoints: number;
    pointsGain: number;
    playerPointsGain: number;
    captainBonusGain: number;
    captainInherited: boolean;
  } | null;
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
  options: { suppressGoalkeeperRewards?: boolean } = {},
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
      goalkeeperGoals: 0,
      goalkeeperAssists: 0,
      goalkeeperOwnGoals: 0,
      goalkeeperWins: 0,
      goalkeeperDraws: 0,
      goalkeeperLosses: 0,
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
    const scoringEligibleByPlayerId = new Map(
      match.players.map((participant) => [participant.playerId, participant.scoringEligible !== false] as const),
    );

    for (const participant of match.players) {
      if (!participant.resultEligible || participant.scoringEligible === false) continue;
      const current = ensure(participant.playerId, participant.playerProfile);
      const conceded = participant.teamId === match.teamAId ? match.scoreB : match.scoreA;
      current.teamGoalsConceded += conceded;
      const receivesLineDefenseScout = participant.playerProfile === "defensive"
        || Number(settings.scoringVersion || 5) >= 7;
      if (receivesLineDefenseScout && !goalkeeperIds.has(participant.playerId) && isFinished) {
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

    for (const goalkeeper of match.goalkeepers) {
      if (scoringEligibleByPlayerId.get(goalkeeper.playerId) === false) continue;
      const current = ensure(goalkeeper.playerId);
      const conceded = goalkeeper.teamId === match.teamAId ? match.scoreB : match.scoreA;
      current.goalsConceded += conceded;
      // Os scouts brutos permanecem para auditoria mesmo quando a rodada suprime
      // somente as recompensas positivas de goleiro.
      current.goalkeeperGames += 1;
      if (conceded === 0) current.cleanSheets += 1;
      if (isFinished) {
        if (isDraw) current.goalkeeperDraws += 1;
        else if (winner === goalkeeper.teamId) current.goalkeeperWins += 1;
        else current.goalkeeperLosses += 1;
      }
    }

    for (const event of match.events) {
      if (event.isOwnGoal) {
        if (scoringEligibleByPlayerId.get(event.playerId) !== false) {
          const scorer = ensure(event.playerId);
          scorer.ownGoals += 1;
          if (goalkeeperIds.has(event.playerId)) scorer.goalkeeperOwnGoals += 1;
        }
      } else {
        if (scoringEligibleByPlayerId.get(event.playerId) !== false) {
          const scorer = ensure(event.playerId);
          scorer.goals += 1;
          if (goalkeeperIds.has(event.playerId)) scorer.goalkeeperGoals += 1;
        }
        if (event.assistPlayerId && scoringEligibleByPlayerId.get(event.assistPlayerId) !== false) {
          const assister = ensure(event.assistPlayerId);
          assister.assists += 1;
          if (goalkeeperIds.has(event.assistPlayerId)) assister.goalkeeperAssists += 1;
        }
      }
    }
  }

  return new Map(
    [...stats.entries()].map(([playerId, value]) => [
      playerId,
      {
        ...value,
        basePoints: Number(settings.scoringVersion || 0) >= 14
          ? calculateFantasyRankedPoints(value, {
              ...settings,
              suppressGoalkeeperRewards: Boolean(options.suppressGoalkeeperRewards),
            })
          : calculateFantasyPlayerPoints(value, {
              ...settings,
              goalkeeperAppearancePoints: options.suppressGoalkeeperRewards ? 0 : settings.goalkeeperAppearancePoints,
            }),
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
    const basePointsByPlayer = new Map<string, number>();
    let positionBonus = 0;

    for (const playerId of lineup.playerIds) {
      const stats = playerStats.get(playerId);
      const slot = slotByPlayer.get(playerId);
      const columnC = Number(settings.scoringVersion || 0) >= 11;
      const bonus = !columnC && stats && slot
        ? calculateFantasyPositionPackageBonus(
            {
              slotRole: slot.slotRole,
              playerProfile: slot.playerProfile ?? stats.playerProfile,
              goals: stats.goals,
              assists: stats.assists,
              draws: stats.draws,
              games: stats.games,
              losses: stats.losses,
              goalkeeperGames: stats.goalkeeperGames,
              goalsConceded: stats.goalsConceded,
              cleanSheets: stats.cleanSheets,
              defensiveCleanGames: stats.defensiveCleanGames,
              defensiveOneGoalGames: stats.defensiveOneGoalGames,
              suppressGoalkeeperRewards: settings.suppressGoalkeeperRewards,
            },
            settings,
          )
        : 0;
      const basePoints = !stats
        ? 0
        : !slot
          ? stats.basePoints || 0
          : columnC
            ? calculateFantasySlotPoints(stats, slot.slotRole, settings)
            : slot.slotRole === "GOL" && Number(settings.scoringVersion || 5) >= 10
              ? calculateFantasyGoalkeeperSlotPoints(stats, settings)
              : stats.basePoints || 0;
      positionBonus += bonus;
      basePointsByPlayer.set(playerId, basePoints);
      pointsByPlayer.set(playerId, basePoints + bonus);
    }

    const starterPoints = [...pointsByPlayer.values()].reduce((sum, points) => sum + points, 0);
    const captainBase = lineup.captainPlayerId ? pointsByPlayer.get(lineup.captainPlayerId) || 0 : 0;
    const captainTotal = applyCaptainMultiplier(captainBase, settings.captainMultiplier);
    const captainBonus = captainTotal - captainBase;
    const players = lineup.playerIds.map((playerId) => {
      const slot = slotByPlayer.get(playerId);
      const basePoints = basePointsByPlayer.get(playerId) || 0;
      const totalWithoutCaptain = pointsByPlayer.get(playerId) || 0;
      const positionBonus = totalWithoutCaptain - basePoints;
      const playerCaptainBonus = playerId === lineup.captainPlayerId
        ? applyCaptainMultiplier(totalWithoutCaptain, settings.captainMultiplier) - totalWithoutCaptain
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
    const reserveStats = lineup.reserve ? playerStats.get(lineup.reserve.playerId) : null;
    const reserveBasePoints = reserveStats && lineup.reserve
      ? calculateFantasySlotPoints(reserveStats, lineup.reserve.slotRole, settings)
      : 0;
    const reserveResolution = lineup.reserve
      ? resolveFantasyReserveSubstitution({
          reserveRole: lineup.reserve.slotRole,
          reservePoints: reserveBasePoints,
          starters: players.map((player, slotIndex) => ({
            playerId: player.playerId,
            slotRole: player.slotRole || "ATA",
            basePoints: player.basePoints + player.positionBonus,
            totalPoints: player.totalPoints,
            captainBonus: player.captainBonus,
            isCaptain: player.playerId === lineup.captainPlayerId,
            slotIndex,
          })),
          captainMultiplier: settings.captainMultiplier,
        })
      : null;
    const playerPoints = starterPoints + (reserveResolution?.playerPointsGain || 0);
    const effectiveCaptainBonus = captainBonus + (reserveResolution?.captainBonusGain || 0);
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
      captainBonus: effectiveCaptainBonus,
      predictionPoints,
      cardPoints,
      reserve: lineup.reserve && reserveResolution
        ? {
            playerId: lineup.reserve.playerId,
            slotRole: lineup.reserve.slotRole,
            basePoints: reserveBasePoints,
            ...reserveResolution,
          }
        : null,
      totalPoints: playerPoints + effectiveCaptainBonus + predictionPoints + cardPoints,
      provisional: true,
    };
  });
}
