import type { PlayerProfile } from "./types";

/** Motor puro do OVR BQ. Não lê nem escreve no banco. */
export type OverallRole = "DEF" | "ALA_MEI" | "ATA" | "GOL";
export type OverallResult = "win" | "draw" | "loss";
export type OverallSeedMode = "legacy_tag" | "observed";

export type OverallPlayer = {
  id: string;
  /** Tag histórica; só jogadores legados a usam como estimativa temporária. */
  playerProfile: PlayerProfile | null;
  overallSeedMode?: OverallSeedMode;
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
  scoutTotals: {
    goals: number;
    assists: number;
    ownGoals: number;
  };
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
  scoutTotals: PlayerOverallSnapshot["scoutTotals"];
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundOverall(value: number) {
  return Math.round(value * 10) / 10;
}

function provisionalPositionCap(validRounds: number) {
  if (validRounds <= 0) return 99;
  if (validRounds === 1) return 74;
  if (validRounds === 2) return 76;
  if (validRounds < PROVISIONAL_ROUNDS) return 78;
  return 99;
}

function profileRole(profile: PlayerProfile | null): OverallRole {
  if (profile === "defensive") return "DEF";
  if (profile === "offensive") return "ATA";
  return "ALA_MEI";
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
  // A tag é uma estimativa histórica, não uma regra permanente. Jogadores
  // novos entram pelo modo observado, neutros até construírem evidência.
  return player.overallSeedMode === "legacy_tag" && profileRole(player.playerProfile) === role ? 73 : 70;
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
    scoutTotals: { goals: 0, assists: 0, ownGoals: 0 },
  };
}

function calculateRoundAttackingScore(appearances: OverallAppearance[]) {
  const totals = appearances.reduce((result, appearance) => ({
    goals: result.goals + Number(appearance.goals || 0),
    assists: result.assists + Number(appearance.assists || 0),
    ownGoals: result.ownGoals + Number(appearance.ownGoals || 0),
    seconds: result.seconds + exposure(appearance.secondsPlayed),
    resultSeconds: result.resultSeconds + resultScore(appearance.result) * exposure(appearance.secondsPlayed),
  }), { goals: 0, assists: 0, ownGoals: 0, seconds: 0, resultSeconds: 0 });
  const resultAverage = totals.seconds > 0 ? totals.resultSeconds / totals.seconds : 0.5;
  const production = totals.goals + totals.assists * 0.7;
  // A rodada semanal é a unidade competitiva da pelada. Cada gol e assistência
  // acrescenta valor de forma linear, em vez de ser achatado por partida.
  const individualActions = clamp(0.25 + production * 0.14, 0, 1);
  const score = clamp(individualActions * 0.8 + resultAverage * 0.2 - totals.ownGoals * 0.15, 0, 1);
  return { score, totals };
}

function calculateMatchScore(
  role: OverallRole,
  appearance: OverallAppearance,
  baselineConcededRate: number,
  roundAttackingScore: number,
) {
  if (role === "GOL" && !appearance.isGoalkeeper) return null;

  const seconds = exposure(appearance.secondsPlayed);
  if (seconds === 0) return null;
  const ownGoals = Number(appearance.ownGoals || 0);
  const conceded = Number(appearance.goalsConceded || 0);
  const concededRate = perSevenMinuteRate(conceded, seconds);
  const rateImpact = clamp(0.5 + ((baselineConcededRate - concededRate) / Math.max(baselineConcededRate, 0.25)) * 0.25, 0, 1);
  const resilience = clamp(seconds / (MAX_MATCH_SECONDS * (conceded + 0.5)), 0, 1);
  const cleanTime = conceded === 0 ? seconds / MAX_MATCH_SECONDS : 0;
  const defensive = clamp(
    rateImpact * 0.47 + resilience * 0.30 + cleanTime * 0.18 + resultScore(appearance.result) * 0.02 + (ownGoals === 0 ? 1 : 0) * 0.03,
    0,
    1,
  );
  const attacking = roundAttackingScore;

  if (role === "GOL") return clamp(defensive * 0.9 + attacking * 0.1, 0, 1);

  const weights = role === "DEF" ? [0.85, 0.15] : role === "ALA_MEI" ? [0.5, 0.5] : [0.2, 0.8];
  return clamp(defensive * weights[0] + attacking * weights[1], 0, 1);
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
  const seedBonus = player.overallSeedMode === "legacy_tag" && profileRole(player.playerProfile) === role
    // O ponto de partida 73 perde 20% a cada rodada válida. Na quinta, a
    // especialidade inicial some e ficam somente as atuações observadas.
    ? 3 * clamp(1 - validRounds / PROVISIONAL_ROUNDS, 0, 1)
    : 0;
  const target = clamp(70 + (weightedScore - 0.5) * 40 * confidence + seedBonus, 40, 99);

  return { target, confidence, validRounds };
}

function calculateGeneral(values: Record<OverallRole, number>, goalkeeperRounds: number, confidence: number) {
  const lineValues = [values.DEF, values.ALA_MEI, values.ATA].sort((a, b) => b - a);
  const eligible = goalkeeperRounds >= PROVISIONAL_ROUNDS
    ? [...lineValues, values.GOL].sort((a, b) => b - a)
    : lineValues;
  const rawOverall = eligible[0] * 0.7 + eligible[1] * 0.3;
  // A nota pública só se afasta de 70 na proporção da amostra. Isso impede
  // que uma rodada excelente coloque um estreante acima de veteranos.
  return roundOverall(70 + (rawOverall - 70) * confidence);
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
  const overallConfidence = Math.max(positions.DEF.confidence, positions.ALA_MEI.confidence, positions.ATA.confidence);
  return {
    playerId: player.id,
    overall: calculateGeneral(state.values, goalkeeperRounds, overallConfidence),
    positions,
    roundsPlayed,
    goalkeeperRounds,
    isProvisional: roundsPlayed < PROVISIONAL_ROUNDS,
    isStale: state.lastRoundSequence !== null && currentSequence - state.lastRoundSequence >= STALE_AFTER_ROUNDS,
    lastRoundId: state.lastRoundId,
    scoutTotals: { ...state.scoutTotals },
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
      const roundAttack = calculateRoundAttackingScore(appearances);
      for (const appearance of appearances) {
        for (const role of ROLES) {
          const score = calculateMatchScore(role, appearance, baselineConcededRate, roundAttack.score);
          if (score === null) continue;
          state.history.push({ roundId: round.id, roundSequence: round.sequence, role, score, secondsPlayed: exposure(appearance.secondsPlayed) });
        }
        historicalConcededRates.push(perSevenMinuteRate(appearance.goalsConceded, appearance.secondsPlayed));
      }
      state.scoutTotals.goals += roundAttack.totals.goals;
      state.scoutTotals.assists += roundAttack.totals.assists;
      state.scoutTotals.ownGoals += roundAttack.totals.ownGoals;
      state.playedRoundIds.add(round.id);
      if (appearances.some((appearance) => appearance.isGoalkeeper)) state.goalkeeperRoundIds.add(round.id);
      state.lastRoundId = round.id;
      state.lastRoundSequence = round.sequence;

      for (const role of ROLES) {
        const estimate = positionEstimate(player, state, role, round.sequence);
        const previous = state.values[role];
        state.values[role] = roundOverall(clamp(
          estimate.target,
          previous - MAX_CHANGE_PER_ROUND,
          Math.min(previous + MAX_CHANGE_PER_ROUND, provisionalPositionCap(estimate.validRounds)),
        ));
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
