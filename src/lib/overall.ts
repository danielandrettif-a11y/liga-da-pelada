import type { PlayerProfile } from "./types";

/** Motor puro do OVR BQ. Não lê nem escreve no banco. */
export type OverallRole = "DEF" | "ALA_MEI" | "ATA" | "GOL";
export type OverallResult = "win" | "draw" | "loss";

export type OverallPlayer = {
  id: string;
  playerProfile: PlayerProfile | null;
  isGoalkeeper?: boolean;
};

/** Uma atuação em uma partida. A camada de dados reconstrói estes valores a partir do histórico oficial. */
export type OverallAppearance = {
  playerId: string;
  teamId: string;
  secondsPlayed: number;
  goalsConceded: number;
  goals?: number;
  assists?: number;
  ownGoals?: number;
  result: OverallResult;
  /** Posição congelada em player_round_stats para aquela rodada. */
  playerProfileLocked: PlayerProfile | null;
  /** Só atuações reais no gol podem calcular OVR GOL. */
  isGoalkeeper: boolean;
};

export type OverallRoundInput = {
  id: string;
  sequence: number;
  date: string;
  roundType: "official" | "friendly";
  status: "finished" | "draft" | "active";
  appearances: OverallAppearance[];
};

export type OverallPositionSnapshot = {
  role: OverallRole;
  value: number;
  confidence: number;
  validRounds: number;
};

export type PlayerOverallSnapshot = {
  playerId: string;
  overall: number;
  positions: Record<OverallRole, OverallPositionSnapshot>;
  roundsPlayed: number;
  goalkeeperRounds: number;
  isProvisional: boolean;
  isStale: boolean;
  lastRoundId: string | null;
};

export type OverallCalculationResult = {
  snapshots: PlayerOverallSnapshot[];
  snapshotsByRound: Array<{ roundId: string; snapshots: PlayerOverallSnapshot[] }>;
};

const ROLES: OverallRole[] = ["DEF", "ALA_MEI", "ATA", "GOL"];
const MAX_MATCH_SECONDS = 7 * 60;
const RECENT_ROUND_WINDOW = 20;
const HALF_LIFE_ROUNDS = 8;
const PROVISIONAL_ROUNDS = 5;
const STALE_AFTER_ROUNDS = 6;
const MAX_CHANGE_PER_ROUND = 2;

type Performance = {
  roundId: string;
  roundSequence: number;
  role: OverallRole;
  score: number;
  secondsPlayed: number;
};

type MutablePlayerState = {
  values: Record<OverallRole, number>;
  history: Performance[];
  playedRoundIds: Set<string>;
  goalkeeperRoundIds: Set<string>;
  lastRoundId: string | null;
  lastRoundSequence: number | null;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundOverall(value: number) {
  return Math.round(value * 10) / 10;
}

function profileRole(profile: PlayerProfile | null): OverallRole {
  if (profile === "defensive") return "DEF";
  if (profile === "offensive") return "ATA";
  return "ALA_MEI";
}

function defensiveResponsibility(profile: PlayerProfile | null) {
  if (profile === "defensive") return 1;
  if (profile === "midfield") return 0.75;
  return 0.5;
}

function offensiveResponsibility(profile: PlayerProfile | null) {
  if (profile === "offensive") return 1;
  if (profile === "midfield") return 0.75;
  return 0.5;
}

function towardNeutral(value: number, responsibility: number) {
  return clamp(0.5 + (value - 0.5) * responsibility, 0, 1);
}

function resultScore(result: OverallResult) {
  return result === "win" ? 1 : result === "draw" ? 0.5 : 0;
}

function exposure(secondsPlayed: number) {
  return clamp(secondsPlayed, 0, MAX_MATCH_SECONDS);
}

function perSevenMinuteRate(goals: number, secondsPlayed: number) {
  return Number(goals || 0) * MAX_MATCH_SECONDS / Math.max(exposure(secondsPlayed), 90);
}

function basePositionValue(player: OverallPlayer, role: OverallRole) {
  return profileRole(player.playerProfile) === role ? 73 : 70;
}

function emptyPositions(player: OverallPlayer): Record<OverallRole, number> {
  return Object.fromEntries(ROLES.map((role) => [role, basePositionValue(player, role)])) as Record<OverallRole, number>;
}

function createPlayerState(player: OverallPlayer): MutablePlayerState {
  return {
    values: emptyPositions(player),
    history: [],
    playedRoundIds: new Set<string>(),
    goalkeeperRoundIds: new Set<string>(),
    lastRoundId: null,
    lastRoundSequence: null,
  };
}

function calculateMatchScore(
  role: OverallRole,
  appearance: OverallAppearance,
  baselineConcededRate: number,
) {
  if (role === "GOL" && !appearance.isGoalkeeper) return null;

  const seconds = exposure(appearance.secondsPlayed);
  if (seconds === 0) return null;
  const goals = Number(appearance.goals || 0);
  const assists = Number(appearance.assists || 0);
  const ownGoals = Number(appearance.ownGoals || 0);
  const conceded = Number(appearance.goalsConceded || 0);
  const concededRate = perSevenMinuteRate(conceded, seconds);
  const rateImpact = clamp(0.5 + ((baselineConcededRate - concededRate) / Math.max(baselineConcededRate, 0.25)) * 0.25, 0, 1);
  const resilience = clamp(seconds / (MAX_MATCH_SECONDS * (conceded + 0.5)), 0, 1);
  const cleanTime = conceded === 0 ? seconds / MAX_MATCH_SECONDS : 0;
  const defensive = clamp(
    rateImpact * 0.42 + resilience * 0.27 + cleanTime * 0.16 + resultScore(appearance.result) * 0.1 + (ownGoals === 0 ? 1 : 0) * 0.05,
    0,
    1,
  );
  const offensiveActions = 1 - Math.exp(-(goals * 1.25 + assists * 0.85));
  const attacking = clamp(resultScore(appearance.result) * 0.35 + offensiveActions * 0.65 - ownGoals * 0.2, 0, 1);

  if (role === "GOL") return clamp(defensive * 0.9 + attacking * 0.1, 0, 1);

  const defensiveWithResponsibility = towardNeutral(defensive, defensiveResponsibility(appearance.playerProfileLocked));
  const attackingWithResponsibility = towardNeutral(attacking, offensiveResponsibility(appearance.playerProfileLocked));
  const weights = role === "DEF" ? [0.85, 0.15] : role === "ALA_MEI" ? [0.5, 0.5] : [0.2, 0.8];
  return clamp(defensiveWithResponsibility * weights[0] + attackingWithResponsibility * weights[1], 0, 1);
}

function positionEstimate(
  player: OverallPlayer,
  state: MutablePlayerState,
  role: OverallRole,
  currentSequence: number,
) {
  const relevant = state.history
    .filter((record) => record.role === role && currentSequence - record.roundSequence < RECENT_ROUND_WINDOW)
    .map((record) => ({
      ...record,
      weight: Math.pow(0.5, (currentSequence - record.roundSequence) / HALF_LIFE_ROUNDS) * (record.secondsPlayed / MAX_MATCH_SECONDS),
    }));
  const validRounds = new Set(relevant.map((record) => record.roundId)).size;
  const totalWeight = relevant.reduce((total, record) => total + record.weight, 0);
  const weightedScore = totalWeight > 0
    ? relevant.reduce((total, record) => total + record.score * record.weight, 0) / totalWeight
    : 0.5;
  const exposureConfidence = clamp(totalWeight / PROVISIONAL_ROUNDS, 0, 1);
  const roundConfidence = clamp(validRounds / PROVISIONAL_ROUNDS, 0, 1);
  const confidence = Math.sqrt(exposureConfidence * roundConfidence);
  const priorRounds = role === "GOL" ? state.goalkeeperRoundIds.size : state.playedRoundIds.size;
  const priorBonus = profileRole(player.playerProfile) === role
    ? 3 * clamp(1 - priorRounds / PROVISIONAL_ROUNDS, 0, 1)
    : 0;
  const target = clamp(70 + (weightedScore - 0.5) * 40 * confidence + priorBonus, 40, 99);

  return { target, confidence, validRounds };
}

function calculateGeneral(values: Record<OverallRole, number>, goalkeeperRounds: number) {
  const lineValues = [values.DEF, values.ALA_MEI, values.ATA].sort((a, b) => b - a);
  const eligible = goalkeeperRounds >= PROVISIONAL_ROUNDS
    ? [...lineValues, values.GOL].sort((a, b) => b - a)
    : lineValues;
  return roundOverall(eligible[0] * 0.7 + eligible[1] * 0.3);
}

function cloneSnapshot(player: OverallPlayer, state: MutablePlayerState, currentSequence: number): PlayerOverallSnapshot {
  const positions = Object.fromEntries(ROLES.map((role) => {
    const estimate = positionEstimate(player, state, role, currentSequence);
    return [role, {
      role,
      value: roundOverall(state.values[role]),
      confidence: roundOverall(estimate.confidence),
      validRounds: estimate.validRounds,
    }];
  })) as Record<OverallRole, OverallPositionSnapshot>;
  const roundsPlayed = state.playedRoundIds.size;
  const goalkeeperRounds = state.goalkeeperRoundIds.size;
  return {
    playerId: player.id,
    overall: calculateGeneral(state.values, goalkeeperRounds),
    positions,
    roundsPlayed,
    goalkeeperRounds,
    isProvisional: roundsPlayed < PROVISIONAL_ROUNDS,
    isStale: state.lastRoundSequence !== null && currentSequence - state.lastRoundSequence >= STALE_AFTER_ROUNDS,
    lastRoundId: state.lastRoundId,
  };
}

/**
 * Calcula o histórico inteiro em memória. Somente rodadas oficiais finalizadas
 * entram no modelo; amistosos e rodadas abertas são ignorados deliberadamente.
 */
export function calculatePlayerOveralls(players: OverallPlayer[], rounds: OverallRoundInput[]): OverallCalculationResult {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const stateByPlayerId = new Map<string, MutablePlayerState>(players.map((player) => [player.id, createPlayerState(player)]));
  const completedRounds = [...rounds]
    .filter((round) => round.roundType === "official" && round.status === "finished")
    .sort((left, right) => left.sequence - right.sequence || left.date.localeCompare(right.date));
  const snapshotsByRound: OverallCalculationResult["snapshotsByRound"] = [];
  const historicalConcededRates: number[] = [];

  for (const round of completedRounds) {
    const baselineConcededRate = historicalConcededRates.length
      ? historicalConcededRates.reduce((total, rate) => total + rate, 0) / historicalConcededRates.length
      : 1;
    const appearancesByPlayer = new Map<string, OverallAppearance[]>();
    for (const appearance of round.appearances) {
      if (!playerById.has(appearance.playerId)) continue;
      const current = appearancesByPlayer.get(appearance.playerId) || [];
      current.push(appearance);
      appearancesByPlayer.set(appearance.playerId, current);
    }

    for (const [playerId, appearances] of appearancesByPlayer) {
      const player = playerById.get(playerId)!;
      const state = stateByPlayerId.get(playerId)!;
      for (const appearance of appearances) {
        for (const role of ROLES) {
          const score = calculateMatchScore(role, appearance, baselineConcededRate);
          if (score === null) continue;
          state.history.push({ roundId: round.id, roundSequence: round.sequence, role, score, secondsPlayed: exposure(appearance.secondsPlayed) });
        }
        historicalConcededRates.push(perSevenMinuteRate(appearance.goalsConceded, appearance.secondsPlayed));
      }
      state.playedRoundIds.add(round.id);
      if (appearances.some((appearance) => appearance.isGoalkeeper)) state.goalkeeperRoundIds.add(round.id);
      state.lastRoundId = round.id;
      state.lastRoundSequence = round.sequence;

      for (const role of ROLES) {
        const estimate = positionEstimate(player, state, role, round.sequence);
        const previous = state.values[role];
        state.values[role] = roundOverall(clamp(estimate.target, previous - MAX_CHANGE_PER_ROUND, previous + MAX_CHANGE_PER_ROUND));
      }
    }

    snapshotsByRound.push({
      roundId: round.id,
      snapshots: players.map((player) => cloneSnapshot(player, stateByPlayerId.get(player.id)!, round.sequence)),
    });
  }

  const latestSequence = completedRounds.at(-1)?.sequence ?? 0;
  return {
    snapshots: players.map((player) => cloneSnapshot(player, stateByPlayerId.get(player.id)!, latestSequence)),
    snapshotsByRound,
  };
}
