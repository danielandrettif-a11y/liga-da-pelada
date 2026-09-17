import type { PlayerProfile } from "./types";

/** Motor puro do OVR BQ. Não lê nem escreve no banco. */
export type OverallRole = "DEF" | "ALA_MEI" | "ATA" | "GOL";
export type OverallResult = "win" | "draw" | "loss";
export type OverallSeedMode = "legacy_tag" | "observed";
export type GoalTimingQuality = "exact" | "fallback";

export type OverallFormulaConfig = {
  base: number;
  legacyInitialTagBonus: number;
  seedFadeRounds: number;
  confidenceRounds: number;
  goalkeeperEligibilityRounds: number;
  positionCaps: Record<"1" | "2" | "3", number>;
  staleAfterRounds: number;
  halfLifeRounds: number;
  recentRoundWindow: number;
  maxChangePerRound: number;
  defensiveWeights: {
    concededRate: number;
    survival: number;
    exposure: number;
    discipline: number;
  };
  legacyTimingConfidence: number;
};

export const DEFAULT_OVERALL_FORMULA: OverallFormulaConfig = {
  base: 70,
  legacyInitialTagBonus: 3,
  seedFadeRounds: 3,
  confidenceRounds: 3,
  goalkeeperEligibilityRounds: 3,
  positionCaps: { "1": 74, "2": 76, "3": 78 },
  staleAfterRounds: 4,
  halfLifeRounds: 3,
  recentRoundWindow: 8,
  maxChangePerRound: 2,
  defensiveWeights: { concededRate: 0.5, survival: 0.35, exposure: 0.1, discipline: 0.05 },
  legacyTimingConfidence: 0.75,
};

export function parseOverallFormulaConfig(value: unknown): OverallFormulaConfig {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (key: keyof OverallFormulaConfig, fallback: number) => {
    const parsed = Number(candidate[key]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const positionCaps = candidate.positionCaps && typeof candidate.positionCaps === "object"
    ? candidate.positionCaps as Record<string, unknown>
    : {};
  const defensiveWeights = candidate.defensiveWeights && typeof candidate.defensiveWeights === "object"
    ? candidate.defensiveWeights as Record<string, unknown>
    : {};
  const weight = (key: keyof OverallFormulaConfig["defensiveWeights"]) => {
    const parsed = Number(defensiveWeights[key]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_OVERALL_FORMULA.defensiveWeights[key];
  };
  const rawWeights = {
    concededRate: weight("concededRate"),
    survival: weight("survival"),
    exposure: weight("exposure"),
    discipline: weight("discipline"),
  };
  const totalWeight = Object.values(rawWeights).reduce((total, item) => total + item, 0) || 1;
  return {
    base: number("base", DEFAULT_OVERALL_FORMULA.base),
    legacyInitialTagBonus: number("legacyInitialTagBonus", DEFAULT_OVERALL_FORMULA.legacyInitialTagBonus),
    seedFadeRounds: number("seedFadeRounds", DEFAULT_OVERALL_FORMULA.seedFadeRounds),
    confidenceRounds: number("confidenceRounds", DEFAULT_OVERALL_FORMULA.confidenceRounds),
    goalkeeperEligibilityRounds: number("goalkeeperEligibilityRounds", DEFAULT_OVERALL_FORMULA.goalkeeperEligibilityRounds),
    positionCaps: {
      "1": Number(positionCaps["1"]) || DEFAULT_OVERALL_FORMULA.positionCaps["1"],
      "2": Number(positionCaps["2"]) || DEFAULT_OVERALL_FORMULA.positionCaps["2"],
      "3": Number(positionCaps["3"]) || DEFAULT_OVERALL_FORMULA.positionCaps["3"],
    },
    staleAfterRounds: number("staleAfterRounds", DEFAULT_OVERALL_FORMULA.staleAfterRounds),
    halfLifeRounds: number("halfLifeRounds", DEFAULT_OVERALL_FORMULA.halfLifeRounds),
    recentRoundWindow: number("recentRoundWindow", DEFAULT_OVERALL_FORMULA.recentRoundWindow),
    maxChangePerRound: number("maxChangePerRound", DEFAULT_OVERALL_FORMULA.maxChangePerRound),
    defensiveWeights: {
      concededRate: rawWeights.concededRate / totalWeight,
      survival: rawWeights.survival / totalWeight,
      exposure: rawWeights.exposure / totalWeight,
      discipline: rawWeights.discipline / totalWeight,
    },
    legacyTimingConfidence: number("legacyTimingConfidence", DEFAULT_OVERALL_FORMULA.legacyTimingConfidence),
  };
}

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
  matchId: string;
  teamId: string;
  secondsPlayed: number;
  matchSeconds: number;
  goalsConceded: number;
  concededGoalSeconds?: number[];
  goalTimingQuality: GoalTimingQuality;
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
  createdAt?: string;
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
  breakdowns: OverallRoundBreakdown[];
};

export type OverallRoundBreakdown = {
  playerId: string;
  roundId: string;
  roundDate: string;
  roundIndex: number;
  goals: number;
  assists: number;
  ownGoals: number;
  goalsConceded: number;
  attackingScore: number;
  defensiveScore: number;
  timingQuality: GoalTimingQuality;
  positions: Record<OverallRole, number>;
  confidence: Record<OverallRole, number>;
};

const ROLES: OverallRole[] = ["DEF", "ALA_MEI", "ATA", "GOL"];
const MAX_MATCH_SECONDS = 7 * 60;
// Uma rodada equivale a uma semana. O modelo precisa acompanhar o momento
// recente sem transformar uma única atuação em tendência definitiva.
type Performance = {
  roundId: string;
  roundIndex: number;
  role: OverallRole;
  score: number;
  secondsPlayed: number;
  qualityWeight: number;
};

type MutablePlayerState = {
  values: Record<OverallRole, number>;
  history: Performance[];
  playedRoundIds: Set<string>;
  goalkeeperRoundIds: Set<string>;
  lastRoundId: string | null;
  lastRoundIndex: number | null;
  scoutTotals: PlayerOverallSnapshot["scoutTotals"];
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundOverall(value: number) {
  return Math.round(value * 10) / 10;
}

function provisionalPositionCap(validRounds: number, config: OverallFormulaConfig) {
  if (validRounds <= 0) return 99;
  if (validRounds === 1) return config.positionCaps["1"];
  if (validRounds === 2) return config.positionCaps["2"];
  if (validRounds === 3) return config.positionCaps["3"];
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

function basePositionValue(player: OverallPlayer, role: OverallRole, config: OverallFormulaConfig) {
  // A tag é uma estimativa histórica, não uma regra permanente. Jogadores
  // novos entram pelo modo observado, neutros até construírem evidência.
  return player.overallSeedMode === "legacy_tag" && profileRole(player.playerProfile) === role
    ? config.base + config.legacyInitialTagBonus
    : config.base;
}

function emptyPositions(player: OverallPlayer, config: OverallFormulaConfig): Record<OverallRole, number> {
  return Object.fromEntries(ROLES.map((role) => [role, basePositionValue(player, role, config)])) as Record<OverallRole, number>;
}

function createPlayerState(player: OverallPlayer, config: OverallFormulaConfig): MutablePlayerState {
  return {
    values: emptyPositions(player, config),
    history: [],
    playedRoundIds: new Set<string>(),
    goalkeeperRoundIds: new Set<string>(),
    lastRoundId: null,
    lastRoundIndex: null,
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
  config: OverallFormulaConfig,
): { score: number; defensiveScore: number; qualityWeight: number } | null {
  if (role === "GOL" && !appearance.isGoalkeeper) return null;

  const seconds = exposure(appearance.secondsPlayed);
  if (seconds === 0) return null;
  const ownGoals = Number(appearance.ownGoals || 0);
  const conceded = Number(appearance.goalsConceded || 0);
  const concededRate = perSevenMinuteRate(conceded, seconds);
  const rateImpact = clamp(0.5 + ((baselineConcededRate - concededRate) / Math.max(baselineConcededRate, 0.25)) * 0.25, 0, 1);
  const firstConcededSecond = [...(appearance.concededGoalSeconds || [])].sort((left, right) => left - right)[0];
  const survival = conceded === 0
    ? 1
    : appearance.goalTimingQuality === "exact" && Number.isFinite(firstConcededSecond)
      ? clamp(Number(firstConcededSecond) / Math.max(seconds, 1), 0, 1)
      : conceded === 1 ? 0.5 : 0;
  const exposureScore = clamp(seconds / Math.max(appearance.matchSeconds || MAX_MATCH_SECONDS, 1), 0, 1);
  const defensive = clamp(
    rateImpact * config.defensiveWeights.concededRate
      + survival * config.defensiveWeights.survival
      + exposureScore * config.defensiveWeights.exposure
      + (ownGoals === 0 ? 1 : 0) * config.defensiveWeights.discipline,
    0,
    1,
  );
  const attacking = roundAttackingScore;
  const qualityWeight = appearance.goalTimingQuality === "exact" ? 1 : config.legacyTimingConfidence;

  // O goleiro é lido exclusivamente pela proteção do gol. Gols ou assistências
  // não mudam essa posição, mesmo se ele participar da jogada ofensiva.
  if (role === "GOL") return { score: defensive, defensiveScore: defensive, qualityWeight };

  const weights = role === "DEF" ? [0.85, 0.15] : role === "ALA_MEI" ? [0.5, 0.5] : [0.2, 0.8];
  return {
    score: clamp(defensive * weights[0] + attacking * weights[1], 0, 1),
    defensiveScore: defensive,
    qualityWeight,
  };
}

function positionEstimate(
  player: OverallPlayer,
  state: MutablePlayerState,
  role: OverallRole,
  currentRoundIndex: number,
  config: OverallFormulaConfig,
) {
  const relevant = state.history
    .filter((record) => record.role === role && currentRoundIndex - record.roundIndex < config.recentRoundWindow)
    .map((record) => ({
      ...record,
      weight: Math.pow(0.5, (currentRoundIndex - record.roundIndex) / config.halfLifeRounds)
        * (record.secondsPlayed / MAX_MATCH_SECONDS) * record.qualityWeight,
    }));
  const validRounds = new Set(relevant.map((record) => record.roundId)).size;
  const totalWeight = relevant.reduce((total, record) => total + record.weight, 0);
  const weightedScore = totalWeight > 0
    ? relevant.reduce((total, record) => total + record.score * record.weight, 0) / totalWeight
    : 0.5;
  const exposureConfidence = clamp(totalWeight / config.confidenceRounds, 0, 1);
  const roundConfidence = clamp(validRounds / config.confidenceRounds, 0, 1);
  const confidence = Math.sqrt(exposureConfidence * roundConfidence);
  const seedBonus = player.overallSeedMode === "legacy_tag" && profileRole(player.playerProfile) === role
    // Em uma pelada semanal, três rodadas já cobrem quase um mês. Nesse
    // ponto a especialidade inicial some e ficam somente as atuações.
    ? config.legacyInitialTagBonus * clamp(1 - validRounds / config.seedFadeRounds, 0, 1)
    : 0;
  const target = clamp(config.base + (weightedScore - 0.5) * 40 * confidence + seedBonus, 40, 99);

  return { target, confidence, validRounds };
}

function calculateGeneral(values: Record<OverallRole, number>, goalkeeperRounds: number, confidence: number, config: OverallFormulaConfig) {
  const lineValues = [values.DEF, values.ALA_MEI, values.ATA].sort((a, b) => b - a);
  const eligible = goalkeeperRounds >= config.goalkeeperEligibilityRounds
    ? [...lineValues, values.GOL].sort((a, b) => b - a)
    : lineValues;
  const rawOverall = eligible[0] * 0.7 + eligible[1] * 0.3;
  // A nota pública só se afasta de 70 na proporção da amostra. Isso impede
  // que uma rodada excelente coloque um estreante acima de veteranos.
  return roundOverall(config.base + (rawOverall - config.base) * confidence);
}

function cloneSnapshot(player: OverallPlayer, state: MutablePlayerState, currentRoundIndex: number, config: OverallFormulaConfig): PlayerOverallSnapshot {
  const positions = Object.fromEntries(ROLES.map((role) => {
    const estimate = positionEstimate(player, state, role, currentRoundIndex, config);
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
    overall: calculateGeneral(state.values, goalkeeperRounds, overallConfidence, config),
    positions,
    roundsPlayed,
    goalkeeperRounds,
    isProvisional: roundsPlayed <= config.confidenceRounds,
    isStale: state.lastRoundIndex !== null && currentRoundIndex - state.lastRoundIndex >= config.staleAfterRounds,
    lastRoundId: state.lastRoundId,
    scoutTotals: { ...state.scoutTotals },
  };
}

/**
 * Calcula o histórico inteiro em memória. Somente rodadas oficiais finalizadas
 * entram no modelo; amistosos e rodadas abertas são ignorados deliberadamente.
 */
type TeamDefensiveSample = { roundIndex: number; matchId: string; teamId: string; rate: number };

function teamSamplesForRound(round: OverallRoundInput, roundIndex: number) {
  const samples = new Map<string, TeamDefensiveSample>();
  for (const appearance of round.appearances) {
    const key = `${appearance.matchId}:${appearance.teamId}`;
    if (!samples.has(key)) {
      samples.set(key, {
        roundIndex,
        matchId: appearance.matchId,
        teamId: appearance.teamId,
        rate: perSevenMinuteRate(appearance.goalsConceded, appearance.matchSeconds || MAX_MATCH_SECONDS),
      });
    }
  }
  return [...samples.values()];
}

/**
 * Calcula o histórico em ordem cronológica real. `round.number` reinicia a
 * cada temporada, por isso só serve como desempate: a janela de oito rodadas
 * continua atravessando a virada de temporada.
 */
export function calculatePlayerOveralls(
  players: OverallPlayer[],
  rounds: OverallRoundInput[],
  formula: OverallFormulaConfig = DEFAULT_OVERALL_FORMULA,
): OverallCalculationResult {
  const playerById = new Map(players.map((player) => [player.id, player]));
  const stateByPlayerId = new Map<string, MutablePlayerState>(players.map((player) => [player.id, createPlayerState(player, formula)]));
  const completedRounds = [...rounds]
    .filter((round) => round.roundType === "official" && round.status === "finished")
    .sort((left, right) => left.date.localeCompare(right.date)
      || String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
      || left.sequence - right.sequence || left.id.localeCompare(right.id));
  const snapshotsByRound: OverallCalculationResult["snapshotsByRound"] = [];
  const breakdowns: OverallRoundBreakdown[] = [];
  const historicalConcededRates: TeamDefensiveSample[] = [];

  for (const [roundIndex, round] of completedRounds.entries()) {
    const currentTeamSamples = teamSamplesForRound(round, roundIndex);
    const recentSamples = [...historicalConcededRates, ...currentTeamSamples]
      .filter((sample) => roundIndex - sample.roundIndex < formula.recentRoundWindow);
    const baselineConcededRate = recentSamples.length
      ? recentSamples.reduce((total, sample) => total + sample.rate, 0) / recentSamples.length
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
      let defensiveTotal = 0;
      let defensiveWeight = 0;
      let timingQuality: GoalTimingQuality = "exact";
      let goalsConceded = 0;
      for (const appearance of appearances) {
        goalsConceded += Number(appearance.goalsConceded || 0);
        if (appearance.goalTimingQuality === "fallback") timingQuality = "fallback";
        for (const role of ROLES) {
          const outcome = calculateMatchScore(role, appearance, baselineConcededRate, roundAttack.score, formula);
          if (outcome === null) continue;
          state.history.push({
            roundId: round.id,
            roundIndex,
            role,
            score: outcome.score,
            secondsPlayed: exposure(appearance.secondsPlayed),
            qualityWeight: outcome.qualityWeight,
          });
          if (role === "DEF") {
            const weight = exposure(appearance.secondsPlayed);
            defensiveTotal += outcome.defensiveScore * weight;
            defensiveWeight += weight;
          }
        }
      }
      state.scoutTotals.goals += roundAttack.totals.goals;
      state.scoutTotals.assists += roundAttack.totals.assists;
      state.scoutTotals.ownGoals += roundAttack.totals.ownGoals;
      state.playedRoundIds.add(round.id);
      if (appearances.some((appearance) => appearance.isGoalkeeper)) state.goalkeeperRoundIds.add(round.id);
      state.lastRoundId = round.id;
      state.lastRoundIndex = roundIndex;

      for (const role of ROLES) {
        const estimate = positionEstimate(player, state, role, roundIndex, formula);
        const previous = state.values[role];
        state.values[role] = roundOverall(clamp(
          estimate.target,
          previous - formula.maxChangePerRound,
          Math.min(previous + formula.maxChangePerRound, provisionalPositionCap(estimate.validRounds, formula)),
        ));
      }
      const snapshot = cloneSnapshot(player, state, roundIndex, formula);
      breakdowns.push({
        playerId,
        roundId: round.id,
        roundDate: round.date,
        roundIndex,
        goals: roundAttack.totals.goals,
        assists: roundAttack.totals.assists,
        ownGoals: roundAttack.totals.ownGoals,
        goalsConceded,
        attackingScore: roundAttack.score,
        defensiveScore: defensiveWeight ? defensiveTotal / defensiveWeight : 0.5,
        timingQuality,
        positions: Object.fromEntries(ROLES.map((role) => [role, snapshot.positions[role].value])) as Record<OverallRole, number>,
        confidence: Object.fromEntries(ROLES.map((role) => [role, snapshot.positions[role].confidence])) as Record<OverallRole, number>,
      });
    }

    historicalConcededRates.push(...currentTeamSamples);

    snapshotsByRound.push({
      roundId: round.id,
      snapshots: players.map((player) => cloneSnapshot(player, stateByPlayerId.get(player.id)!, roundIndex, formula)),
    });
  }

  const latestRoundIndex = Math.max(0, completedRounds.length - 1);
  return {
    snapshots: players.map((player) => cloneSnapshot(player, stateByPlayerId.get(player.id)!, latestRoundIndex, formula)),
    snapshotsByRound,
    breakdowns,
  };
}
