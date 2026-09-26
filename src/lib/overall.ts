import type { PlayerProfile } from "./types";

/** Motor puro do OVR BQ. Não lê nem escreve no banco. */
export type OverallRole = "DEF" | "ALA_MEI" | "ATA" | "GOL";
export type OverallResult = "win" | "draw" | "loss";
export type OverallSeedMode = "legacy_tag" | "observed";
export type GoalTimingQuality = "exact" | "fallback";
export type OverallTrend = "rising" | "steady" | "falling";

type LineRole = Exclude<OverallRole, "GOL">;
type PositionWeights = { defense: number; attack: number; goals: number; assists: number; result: number };

export type OverallFormulaConfig = {
  base: number;
  legacyInitialTagBonus: number;
  seedFadeRounds: number;
  confidenceRounds: number;
  goalkeeperEligibilityRounds: number;
  goalkeeperEligibilityGames: number;
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
  assistValue: number;
  attackCurve: number;
  goalCurve: number;
  assistCurve: number;
  separateAttackScores: boolean;
  positionWeights: Record<LineRole, PositionWeights>;
  /** Quanto uma atuação na função declarada revela sobre cada posição. */
  roleEvidence: Record<LineRole, Record<LineRole, number>>;
  unassignedRoleEvidence: Record<LineRole, number>;
  /** Peso dado a uma característica não selecionada pelo administrador. */
  unselectedTraitEvidence: number;
  /** A fórmula v5 ignora a tag legada; ela continua apenas nas fórmulas antigas. */
  legacySeedEnabled: boolean;
  /** Impede que várias partidas da mesma pelada multipliquem a confiança semanal. */
  weeklyEvidenceCap: boolean;
  /** Faz a velocidade de mudança respeitar 100%/50%/33%/15% das características. */
  traitWeightedChange: boolean;
  /** Compõe o OVR geral apenas pelas características escolhidas pelo ADM. */
  traitBasedOverall: boolean;
  /** Compatibilidade com versões antigas que reduziam o OVR geral pela confiança novamente. */
  overallConfidenceShrink: boolean;
  /** Usa 70/30 ou 60/25/15, favorecendo a melhor característica sem ignorar as demais. */
  rankedTraitOverall: boolean;
  /** V12: características aceleram a reação da posição, sem definir o OVR geral. */
  traitsAsProgressionBonus: boolean;
  /** Orçamento total de aceleração distribuído sem favorecer quem tem mais tags. */
  traitProgressionBonusBudget: number;
  /** V13: a ordem definida pelo ADM controla a evidência e a evolução de cada posição. */
  prioritizedTraitProgression: boolean;
  traitProgressionWeights: {
    primary: number;
    secondary: number;
    unselected: number;
  };
  /** V12: usa as três maiores posições elegíveis no OVR geral. */
  topThreeOverall: boolean;
  /** Bônus suave de variação proporcional à distância do alvo, sem degrau rígido. */
  performanceChangeBonus: number;
  /** Mantém os tetos rígidos das fórmulas antigas. */
  hardPositionCapsEnabled: boolean;
  /** Fórmulas antigas ainda marcavam a terceira rodada como provisória. */
  provisionalAtConfidenceThreshold: boolean;
  /** Ativa o acelerador suave por sequência recente de atuações. */
  trendEnabled: boolean;
  /** Quantas rodadas jogadas entram na leitura de forma recente. */
  trendWindowRounds: number;
  /** Amostra mínima antes de exibir ou aplicar uma tendência. */
  trendMinimumRounds: number;
  /** Quantas rodadas boas/ruins dentro da janela formam uma tendência. */
  trendRequiredRounds: number;
  /** Corte de qualidade para uma atuação considerada boa. */
  trendHighScore: number;
  /** Corte de qualidade para uma atuação considerada ruim. */
  trendLowScore: number;
  /** Aceleração máxima de subida quando a tendência é positiva. */
  trendUpwardMultiplier: number;
  /** Aceleração máxima de queda quando a tendência é negativa. */
  trendDownwardMultiplier: number;
};

export const DEFAULT_OVERALL_FORMULA: OverallFormulaConfig = {
  base: 70,
  legacyInitialTagBonus: 3,
  seedFadeRounds: 3,
  confidenceRounds: 3,
  goalkeeperEligibilityRounds: 3,
  goalkeeperEligibilityGames: 8,
  positionCaps: { "1": 74, "2": 76, "3": 78 },
  staleAfterRounds: 4,
  halfLifeRounds: 3,
  recentRoundWindow: 8,
  maxChangePerRound: 2,
  defensiveWeights: { concededRate: 0.5, survival: 0.35, exposure: 0.1, discipline: 0.05 },
  legacyTimingConfidence: 0.75,
  assistValue: 0.65,
  attackCurve: 0.32,
  positionWeights: {
    DEF: { defense: 0.85, attack: 0.10, goals: 0, assists: 0, result: 0.05 },
    ALA_MEI: { defense: 0.45, attack: 0.45, goals: 0, assists: 0, result: 0.10 },
    ATA: { defense: 0.15, attack: 0.75, goals: 0, assists: 0, result: 0.10 },
  },
  goalCurve: 0.32,
  assistCurve: 0.28,
  separateAttackScores: false,
  roleEvidence: {
    DEF: { DEF: 1, ALA_MEI: 0.45, ATA: 0.15 },
    ALA_MEI: { DEF: 0.5, ALA_MEI: 1, ATA: 0.5 },
    ATA: { DEF: 0.15, ALA_MEI: 0.45, ATA: 1 },
  },
  unassignedRoleEvidence: { DEF: 0.4, ALA_MEI: 0.55, ATA: 0.4 },
  unselectedTraitEvidence: 0.15,
  legacySeedEnabled: true,
  weeklyEvidenceCap: false,
  traitWeightedChange: false,
  traitBasedOverall: false,
  overallConfidenceShrink: true,
  rankedTraitOverall: false,
  traitsAsProgressionBonus: false,
  traitProgressionBonusBudget: 0.30,
  prioritizedTraitProgression: false,
  traitProgressionWeights: { primary: 1, secondary: 0.6, unselected: 0.2 },
  topThreeOverall: false,
  performanceChangeBonus: 0,
  hardPositionCapsEnabled: true,
  provisionalAtConfidenceThreshold: true,
  trendEnabled: false,
  trendWindowRounds: 3,
  trendMinimumRounds: 3,
  trendRequiredRounds: 2,
  trendHighScore: 0.56,
  trendLowScore: 0.42,
  trendUpwardMultiplier: 0.2,
  trendDownwardMultiplier: 0.3,
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
  const positionWeights = candidate.positionWeights && typeof candidate.positionWeights === "object"
    ? candidate.positionWeights as Record<string, unknown>
    : {};
  const roleEvidence = candidate.roleEvidence && typeof candidate.roleEvidence === "object"
    ? candidate.roleEvidence as Record<string, unknown>
    : {};
  const unassignedRoleEvidence = candidate.unassignedRoleEvidence && typeof candidate.unassignedRoleEvidence === "object"
    ? candidate.unassignedRoleEvidence as Record<string, unknown>
    : {};
  const traitProgressionWeights = candidate.traitProgressionWeights && typeof candidate.traitProgressionWeights === "object"
    ? candidate.traitProgressionWeights as Record<string, unknown>
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
  const bounded = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const wholeNumber = (value: unknown, fallback: number, minimum: number, maximum: number) => (
    clamp(Math.round(bounded(value, fallback)), minimum, maximum)
  );
  const trendWindowRounds = wholeNumber(candidate.trendWindowRounds, DEFAULT_OVERALL_FORMULA.trendWindowRounds, 2, 5);
  const trendMinimumRounds = wholeNumber(candidate.trendMinimumRounds, DEFAULT_OVERALL_FORMULA.trendMinimumRounds, 2, trendWindowRounds);
  const trendRequiredRounds = wholeNumber(candidate.trendRequiredRounds, DEFAULT_OVERALL_FORMULA.trendRequiredRounds, 2, trendWindowRounds);
  const separateAttackScores = candidate.separateAttackScores === true;
  const normalizedPositionWeights = (role: LineRole): PositionWeights => {
    const source = positionWeights[role] && typeof positionWeights[role] === "object"
      ? positionWeights[role] as Record<string, unknown>
      : {};
    const fallback = DEFAULT_OVERALL_FORMULA.positionWeights[role];
    const raw = separateAttackScores
      ? {
          defense: bounded(source.defense, fallback.defense),
          attack: 0,
          goals: bounded(source.goals, fallback.goals),
          assists: bounded(source.assists, fallback.assists),
          result: bounded(source.result, fallback.result),
        }
      : {
          defense: bounded(source.defense, fallback.defense),
          attack: bounded(source.attack, fallback.attack),
          goals: 0,
          assists: 0,
          result: bounded(source.result, fallback.result),
        };
    const sum = raw.defense + raw.attack + raw.goals + raw.assists + raw.result || 1;
    return {
      defense: raw.defense / sum,
      attack: raw.attack / sum,
      goals: raw.goals / sum,
      assists: raw.assists / sum,
      result: raw.result / sum,
    };
  };
  const evidence = (playedRole: LineRole, targetRole: LineRole) => {
    const source = roleEvidence[playedRole] && typeof roleEvidence[playedRole] === "object"
      ? roleEvidence[playedRole] as Record<string, unknown>
      : {};
    return bounded(source[targetRole], DEFAULT_OVERALL_FORMULA.roleEvidence[playedRole][targetRole]);
  };
  return {
    base: number("base", DEFAULT_OVERALL_FORMULA.base),
    legacyInitialTagBonus: number("legacyInitialTagBonus", DEFAULT_OVERALL_FORMULA.legacyInitialTagBonus),
    seedFadeRounds: number("seedFadeRounds", DEFAULT_OVERALL_FORMULA.seedFadeRounds),
    confidenceRounds: number("confidenceRounds", DEFAULT_OVERALL_FORMULA.confidenceRounds),
    goalkeeperEligibilityRounds: number("goalkeeperEligibilityRounds", DEFAULT_OVERALL_FORMULA.goalkeeperEligibilityRounds),
    goalkeeperEligibilityGames: number("goalkeeperEligibilityGames", DEFAULT_OVERALL_FORMULA.goalkeeperEligibilityGames),
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
    assistValue: number("assistValue", DEFAULT_OVERALL_FORMULA.assistValue),
    attackCurve: number("attackCurve", DEFAULT_OVERALL_FORMULA.attackCurve),
    goalCurve: number("goalCurve", DEFAULT_OVERALL_FORMULA.goalCurve),
    assistCurve: number("assistCurve", DEFAULT_OVERALL_FORMULA.assistCurve),
    separateAttackScores,
    positionWeights: {
      DEF: normalizedPositionWeights("DEF"),
      ALA_MEI: normalizedPositionWeights("ALA_MEI"),
      ATA: normalizedPositionWeights("ATA"),
    },
    roleEvidence: {
      DEF: { DEF: evidence("DEF", "DEF"), ALA_MEI: evidence("DEF", "ALA_MEI"), ATA: evidence("DEF", "ATA") },
      ALA_MEI: { DEF: evidence("ALA_MEI", "DEF"), ALA_MEI: evidence("ALA_MEI", "ALA_MEI"), ATA: evidence("ALA_MEI", "ATA") },
      ATA: { DEF: evidence("ATA", "DEF"), ALA_MEI: evidence("ATA", "ALA_MEI"), ATA: evidence("ATA", "ATA") },
    },
    unassignedRoleEvidence: {
      DEF: bounded(unassignedRoleEvidence.DEF, DEFAULT_OVERALL_FORMULA.unassignedRoleEvidence.DEF),
      ALA_MEI: bounded(unassignedRoleEvidence.ALA_MEI, DEFAULT_OVERALL_FORMULA.unassignedRoleEvidence.ALA_MEI),
      ATA: bounded(unassignedRoleEvidence.ATA, DEFAULT_OVERALL_FORMULA.unassignedRoleEvidence.ATA),
    },
    unselectedTraitEvidence: clamp(bounded(candidate.unselectedTraitEvidence, DEFAULT_OVERALL_FORMULA.unselectedTraitEvidence), 0, 1),
    legacySeedEnabled: typeof candidate.legacySeedEnabled === "boolean"
      ? candidate.legacySeedEnabled
      : DEFAULT_OVERALL_FORMULA.legacySeedEnabled,
    weeklyEvidenceCap: typeof candidate.weeklyEvidenceCap === "boolean"
      ? candidate.weeklyEvidenceCap
      : DEFAULT_OVERALL_FORMULA.weeklyEvidenceCap,
    traitWeightedChange: typeof candidate.traitWeightedChange === "boolean"
      ? candidate.traitWeightedChange
      : DEFAULT_OVERALL_FORMULA.traitWeightedChange,
    traitBasedOverall: typeof candidate.traitBasedOverall === "boolean"
      ? candidate.traitBasedOverall
      : DEFAULT_OVERALL_FORMULA.traitBasedOverall,
    overallConfidenceShrink: typeof candidate.overallConfidenceShrink === "boolean"
      ? candidate.overallConfidenceShrink
      : DEFAULT_OVERALL_FORMULA.overallConfidenceShrink,
    rankedTraitOverall: typeof candidate.rankedTraitOverall === "boolean"
      ? candidate.rankedTraitOverall
      : DEFAULT_OVERALL_FORMULA.rankedTraitOverall,
    traitsAsProgressionBonus: typeof candidate.traitsAsProgressionBonus === "boolean"
      ? candidate.traitsAsProgressionBonus
      : DEFAULT_OVERALL_FORMULA.traitsAsProgressionBonus,
    traitProgressionBonusBudget: clamp(bounded(candidate.traitProgressionBonusBudget, DEFAULT_OVERALL_FORMULA.traitProgressionBonusBudget), 0, 0.5),
    prioritizedTraitProgression: typeof candidate.prioritizedTraitProgression === "boolean"
      ? candidate.prioritizedTraitProgression
      : DEFAULT_OVERALL_FORMULA.prioritizedTraitProgression,
    traitProgressionWeights: {
      primary: clamp(bounded(traitProgressionWeights.primary, DEFAULT_OVERALL_FORMULA.traitProgressionWeights.primary), 0, 1),
      secondary: clamp(bounded(traitProgressionWeights.secondary, DEFAULT_OVERALL_FORMULA.traitProgressionWeights.secondary), 0, 1),
      unselected: clamp(bounded(traitProgressionWeights.unselected, DEFAULT_OVERALL_FORMULA.traitProgressionWeights.unselected), 0, 1),
    },
    topThreeOverall: typeof candidate.topThreeOverall === "boolean"
      ? candidate.topThreeOverall
      : DEFAULT_OVERALL_FORMULA.topThreeOverall,
    performanceChangeBonus: clamp(bounded(candidate.performanceChangeBonus, DEFAULT_OVERALL_FORMULA.performanceChangeBonus), 0, 0.2),
    hardPositionCapsEnabled: typeof candidate.hardPositionCapsEnabled === "boolean"
      ? candidate.hardPositionCapsEnabled
      : DEFAULT_OVERALL_FORMULA.hardPositionCapsEnabled,
    provisionalAtConfidenceThreshold: typeof candidate.provisionalAtConfidenceThreshold === "boolean"
      ? candidate.provisionalAtConfidenceThreshold
      : DEFAULT_OVERALL_FORMULA.provisionalAtConfidenceThreshold,
    trendEnabled: typeof candidate.trendEnabled === "boolean"
      ? candidate.trendEnabled
      : DEFAULT_OVERALL_FORMULA.trendEnabled,
    trendWindowRounds,
    trendMinimumRounds,
    trendRequiredRounds,
    trendHighScore: clamp(bounded(candidate.trendHighScore, DEFAULT_OVERALL_FORMULA.trendHighScore), 0, 1),
    trendLowScore: clamp(bounded(candidate.trendLowScore, DEFAULT_OVERALL_FORMULA.trendLowScore), 0, 1),
    trendUpwardMultiplier: clamp(bounded(candidate.trendUpwardMultiplier, DEFAULT_OVERALL_FORMULA.trendUpwardMultiplier), 0, 0.5),
    trendDownwardMultiplier: clamp(bounded(candidate.trendDownwardMultiplier, DEFAULT_OVERALL_FORMULA.trendDownwardMultiplier), 0, 0.5),
  };
}

export type OverallPlayer = {
  id: string;
  /** Tag histórica; só jogadores legados a usam como estimativa temporária. */
  playerProfile: PlayerProfile | null;
  overallSeedMode?: OverallSeedMode;
  isGoalkeeper?: boolean;
  /** Características avaliadas pelo ADM. Não dependem da posição operacional do Cartola. */
  overallTraits?: PlayerProfile[];
};

/** Uma atuação em uma partida. A camada de dados reconstrói estes valores a partir do histórico oficial. */
export type OverallAppearance = {
  playerId: string;
  matchId: string;
  teamId: string;
  secondsPlayed: number;
  matchSeconds: number;
  goalsConceded: number;
  /** Placar total sofrido pelo time na partida; é a base comparável da liga. */
  teamGoalsConceded: number;
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
  trend: OverallTrend;
  positionTrends: Record<OverallRole, OverallTrend>;
  roundsPlayed: number;
  goalkeeperRounds: number;
  goalkeeperGames: number;
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
  goalScore: number;
  assistScore: number;
  defensiveScore: number;
  timingQuality: GoalTimingQuality;
  playedProfile: PlayerProfile | null;
  roleEvidence: Record<OverallRole, number>;
  traitEvidence: Record<OverallRole, number>;
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
  evidenceWeight: number;
};

type MutablePlayerState = {
  values: Record<OverallRole, number>;
  history: Performance[];
  playedRoundIds: Set<string>;
  goalkeeperRoundIds: Set<string>;
  goalkeeperMatchIds: Set<string>;
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

function roleEvidenceWeight(
  profile: PlayerProfile | null,
  role: OverallRole,
  config: OverallFormulaConfig,
) {
  if (role === "GOL") return 1;
  if (!profile) return config.unassignedRoleEvidence[role];
  return config.roleEvidence[profileRole(profile) as LineRole][role];
}

function traitEvidenceWeight(player: OverallPlayer, role: OverallRole, config: OverallFormulaConfig) {
  if (role === "GOL") return 1;
  if (config.prioritizedTraitProgression) {
    const traits = [...new Set((player.overallTraits || []).filter((trait): trait is PlayerProfile => (
      trait === "defensive" || trait === "midfield" || trait === "offensive"
    )))].slice(0, 2);
    const traitForRole: Record<LineRole, PlayerProfile> = {
      DEF: "defensive",
      ALA_MEI: "midfield",
      ATA: "offensive",
    };
    const index = traits.indexOf(traitForRole[role as LineRole]);
    if (index === 0) return config.traitProgressionWeights.primary;
    if (index === 1) return config.traitProgressionWeights.secondary;
    return config.traitProgressionWeights.unselected;
  }
  if (config.traitsAsProgressionBonus) return 1;
  const traits = [...new Set((player.overallTraits || []).filter((trait): trait is PlayerProfile => (
    trait === "defensive" || trait === "midfield" || trait === "offensive"
  )))];
  if (traits.length === 0) return config.unselectedTraitEvidence;
  const traitForRole: Record<LineRole, PlayerProfile> = {
    DEF: "defensive",
    ALA_MEI: "midfield",
    ATA: "offensive",
  };
  return traits.includes(traitForRole[role as LineRole]) ? 1 / traits.length : config.unselectedTraitEvidence;
}

function traitProgressionMultiplier(player: OverallPlayer, role: OverallRole, config: OverallFormulaConfig) {
  if (config.prioritizedTraitProgression) return traitEvidenceWeight(player, role, config);
  if (!config.traitsAsProgressionBonus || role === "GOL") return 1;
  const traits = [...new Set((player.overallTraits || []).filter((trait): trait is PlayerProfile => (
    trait === "defensive" || trait === "midfield" || trait === "offensive"
  )))];
  const roleByTrait: Record<PlayerProfile, LineRole> = {
    defensive: "DEF",
    midfield: "ALA_MEI",
    offensive: "ATA",
  };
  const index = traits.findIndex((trait) => roleByTrait[trait] === role);
  if (index < 0 || traits.length === 0) return 1;
  const budget = config.traitProgressionBonusBudget;
  if (traits.length === 1) return 1 + budget;
  if (traits.length === 2) return 1 + budget * (index === 0 ? 0.65 : 0.35);
  return 1 + budget / 3;
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

function emptyPositions(config: OverallFormulaConfig): Record<OverallRole, number> {
  // O valor guardado começa neutro. A estimativa legada é só de exibição antes
  // da primeira atuação; assim ela desaparece de fato em três rodadas, sem
  // deixar uma diferença escondida pela limitação de dois pontos por rodada.
  return Object.fromEntries(ROLES.map((role) => [role, config.base])) as Record<OverallRole, number>;
}

function createPlayerState(config: OverallFormulaConfig): MutablePlayerState {
  return {
    values: emptyPositions(config),
    history: [],
    playedRoundIds: new Set<string>(),
    goalkeeperRoundIds: new Set<string>(),
    goalkeeperMatchIds: new Set<string>(),
    lastRoundId: null,
    lastRoundIndex: null,
    scoutTotals: { goals: 0, assists: 0, ownGoals: 0 },
  };
}

function calculateRoundScores(appearances: OverallAppearance[], config: OverallFormulaConfig) {
  const totals = appearances.reduce((result, appearance) => ({
    goals: result.goals + Number(appearance.goals || 0),
    assists: result.assists + Number(appearance.assists || 0),
    ownGoals: result.ownGoals + Number(appearance.ownGoals || 0),
    seconds: result.seconds + exposure(appearance.secondsPlayed),
    resultSeconds: result.resultSeconds + resultScore(appearance.result) * exposure(appearance.secondsPlayed),
  }), { goals: 0, assists: 0, ownGoals: 0, seconds: 0, resultSeconds: 0 });
  const resultAverage = totals.seconds > 0 ? totals.resultSeconds / totals.seconds : 0.5;
  const production = totals.goals + totals.assists * config.assistValue;
  // Curva suave: atuações grandes continuam se diferenciando, sem transformar
  // 5 e 10 participações em gol na mesma nota máxima.
  const attackingScore = clamp(
    0.25 + 0.75 * (1 - Math.exp(-production * config.attackCurve)) - totals.ownGoals * 0.15,
    0,
    1,
  );
  const goalScore = clamp(0.25 + 0.75 * (1 - Math.exp(-totals.goals * config.goalCurve)), 0, 1);
  const assistScore = clamp(0.25 + 0.75 * (1 - Math.exp(-totals.assists * config.assistCurve)), 0, 1);
  return { attackingScore, goalScore, assistScore, collectiveScore: resultAverage, totals };
}

function calculateMatchScore(
  role: OverallRole,
  player: OverallPlayer,
  appearance: OverallAppearance,
  baselineConcededRate: number,
  roundScores: { attackingScore: number; goalScore: number; assistScore: number },
  collectiveScore: number,
  config: OverallFormulaConfig,
): { score: number; defensiveScore: number; evidenceWeight: number } | null {
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
  const attacking = roundScores.attackingScore;
  const defensiveQuality = appearance.goalTimingQuality === "exact" ? 1 : config.legacyTimingConfidence;

  // O goleiro é lido exclusivamente pela proteção do gol. Gols ou assistências
  // não mudam essa posição, mesmo se ele participar da jogada ofensiva.
  if (role === "GOL") return { score: defensive, defensiveScore: defensive, evidenceWeight: defensiveQuality };

  const weights = config.positionWeights[role];
  const roleQuality = defensiveQuality * weights.defense
    + weights.attack + weights.goals + weights.assists + weights.result;
  return {
    score: clamp(
      defensive * weights.defense
        + attacking * weights.attack
        + roundScores.goalScore * weights.goals
        + roundScores.assistScore * weights.assists
        + collectiveScore * weights.result,
      0,
      1,
    ),
    defensiveScore: defensive,
    evidenceWeight: roleQuality * traitEvidenceWeight(player, role, config),
  };
}

function positionEstimate(
  player: OverallPlayer,
  state: MutablePlayerState,
  role: OverallRole,
  currentRoundIndex: number,
  config: OverallFormulaConfig,
) {
  const history = state.history
    .filter((record) => record.role === role && currentRoundIndex - record.roundIndex < config.recentRoundWindow);
  const evidence = config.weeklyEvidenceCap
    ? [...history.reduce((rounds, record) => {
        const current = rounds.get(record.roundId) || {
          ...record,
          scoreTotal: 0,
          evidenceTotal: 0,
          totalSeconds: 0,
        };
        const seconds = exposure(record.secondsPlayed);
        current.scoreTotal += record.score * seconds;
        current.evidenceTotal += record.evidenceWeight * seconds;
        current.totalSeconds += seconds;
        rounds.set(record.roundId, current);
        return rounds;
      }, new Map<string, Performance & { scoreTotal: number; evidenceTotal: number; totalSeconds: number }>()).values()]
      .map((record) => ({
        roundId: record.roundId,
        roundIndex: record.roundIndex,
        role: record.role,
        score: record.totalSeconds > 0 ? record.scoreTotal / record.totalSeconds : 0.5,
        evidenceWeight: record.totalSeconds > 0 ? record.evidenceTotal / record.totalSeconds : 0,
        // Uma pelada semanal fornece no máximo uma unidade de amostra, mesmo
        // quando o atleta disputa muitas partidas naquela noite.
        secondsPlayed: Math.min(MAX_MATCH_SECONDS, record.totalSeconds),
      }))
    : history;
  const relevant = evidence
    .map((record) => ({
      ...record,
      weight: Math.pow(0.5, (currentRoundIndex - record.roundIndex) / config.halfLifeRounds)
        * (record.secondsPlayed / MAX_MATCH_SECONDS) * record.evidenceWeight,
    }));
  const validRounds = new Set(relevant.map((record) => record.roundId)).size;
  const totalWeight = relevant.reduce((total, record) => total + record.weight, 0);
  const totalConfidenceWeight = evidence.reduce((total, record) => (
    total + (record.secondsPlayed / MAX_MATCH_SECONDS) * record.evidenceWeight
  ), 0);
  const weightedScore = totalWeight > 0
    ? relevant.reduce((total, record) => total + record.score * record.weight, 0) / totalWeight
    : 0.5;
  // O decaimento temporal escolhe quais atuações pesam mais na nota, mas não
  // apaga a quantidade de evidência já coletada dentro da janela recente.
  const exposureConfidence = clamp(totalConfidenceWeight / config.confidenceRounds, 0, 1);
  const roundConfidence = clamp(validRounds / config.confidenceRounds, 0, 1);
  const confidence = Math.sqrt(exposureConfidence * roundConfidence);
  const seedBonus = config.legacySeedEnabled && player.overallSeedMode === "legacy_tag" && profileRole(player.playerProfile) === role
    // Em uma pelada semanal, três rodadas já cobrem quase um mês. Nesse
    // ponto a especialidade inicial some e ficam somente as atuações.
    ? config.legacyInitialTagBonus * clamp(1 - validRounds / config.seedFadeRounds, 0, 1)
    : 0;
  // O motor guarda apenas o valor observado. A estimativa legada é uma camada
  // temporária de exibição, evitando que um bônus inicial deixe resíduo depois
  // da terceira rodada por causa do limitador semanal de variação.
  const target = clamp(config.base + (weightedScore - 0.5) * 40 * confidence, 40, 99);

  return { target, confidence, validRounds, seedBonus };
}

function positionTrend(
  state: MutablePlayerState,
  role: OverallRole,
  config: OverallFormulaConfig,
): OverallTrend {
  if (!config.trendEnabled) return "steady";
  const eligibleRounds = role === "GOL" ? state.goalkeeperRoundIds.size : state.playedRoundIds.size;
  if (eligibleRounds < config.trendMinimumRounds) return "steady";

  // Várias partidas na mesma pelada formam uma amostra semanal única. A
  // tendência olha somente rodadas em que o atleta participou, portanto uma
  // ausência não reduz a nota nem conta como atuação ruim.
  const byRound = new Map<string, { roundIndex: number; scoreTotal: number; seconds: number }>();
  for (const record of state.history) {
    if (record.role !== role) continue;
    const current = byRound.get(record.roundId) || { roundIndex: record.roundIndex, scoreTotal: 0, seconds: 0 };
    const seconds = exposure(record.secondsPlayed);
    current.scoreTotal += record.score * seconds;
    current.seconds += seconds;
    byRound.set(record.roundId, current);
  }
  const recentRounds = [...byRound.values()]
    .sort((left, right) => right.roundIndex - left.roundIndex)
    .slice(0, config.trendWindowRounds);
  if (recentRounds.length < config.trendMinimumRounds) return "steady";

  const goodRounds = recentRounds.filter((round) => round.seconds > 0 && round.scoreTotal / round.seconds >= config.trendHighScore).length;
  const badRounds = recentRounds.filter((round) => round.seconds > 0 && round.scoreTotal / round.seconds <= config.trendLowScore).length;
  if (goodRounds >= config.trendRequiredRounds && goodRounds > badRounds) return "rising";
  if (badRounds >= config.trendRequiredRounds && badRounds > goodRounds) return "falling";
  return "steady";
}

function calculateLineOverall(player: OverallPlayer, values: Record<OverallRole, number>, config: OverallFormulaConfig) {
  const lineValues = [values.DEF, values.ALA_MEI, values.ATA].sort((a, b) => b - a);
  const traitRoles = [...new Set(player.overallTraits || [])].map((trait) => profileRole(trait)).filter((role): role is LineRole => role !== "GOL");
  const traitValues = traitRoles.map((role) => values[role]).sort((left, right) => right - left);
  const rankedWeights = traitValues.length === 1
    ? [1]
    : traitValues.length === 2
      ? [0.7, 0.3]
      : [0.6, 0.25, 0.15];
  return config.traitBasedOverall && traitValues.length > 0
    ? config.rankedTraitOverall
      ? traitValues.reduce((total, value, index) => total + value * rankedWeights[index], 0)
      : traitValues.reduce((total, value) => total + value, 0) / traitValues.length
    : lineValues[0] * 0.7 + lineValues[1] * 0.3;
}

function generalOverallItems(values: Record<OverallRole, number>, goalkeeperGames: number, config: OverallFormulaConfig) {
  const roles: OverallRole[] = ["DEF", "ALA_MEI", "ATA"];
  if (goalkeeperGames >= config.goalkeeperEligibilityGames) roles.push("GOL");
  return roles
    .map((role) => ({ role, value: values[role] }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 3);
}

function overallTrend(
  player: OverallPlayer,
  positionTrends: Record<OverallRole, OverallTrend>,
  values: Record<OverallRole, number>,
  goalkeeperRounds: number,
  goalkeeperGames: number,
  config: OverallFormulaConfig,
) {
  if (config.topThreeOverall) {
    const score = generalOverallItems(values, goalkeeperGames, config).reduce((total, item, index) => {
      const direction = positionTrends[item.role] === "rising" ? 1 : positionTrends[item.role] === "falling" ? -1 : 0;
      return total + direction * [0.5, 0.35, 0.15][index];
    }, 0);
    return score > 0.001 ? "rising" as const : score < -0.001 ? "falling" as const : "steady" as const;
  }
  // Jogar ocasionalmente no gol gera um atributo GOL real, mas não muda a
  // identidade principal de um atleta de linha. Só goleiros declarados no
  // perfil podem ter a tendência geral definida pelo desempenho no gol.
  if (player.isGoalkeeper && goalkeeperRounds >= config.goalkeeperEligibilityRounds && values.GOL >= calculateLineOverall(player, values, config)) {
    return positionTrends.GOL;
  }
  const traitRoles = [...new Set(player.overallTraits || [])].map((trait) => profileRole(trait)).filter((role): role is LineRole => role !== "GOL");
  const relevantRoles = traitRoles.length > 0 ? traitRoles : ["DEF", "ALA_MEI", "ATA"] as LineRole[];
  const rising = relevantRoles.filter((role) => positionTrends[role] === "rising").length;
  const falling = relevantRoles.filter((role) => positionTrends[role] === "falling").length;
  if (rising > falling) return "rising" as const;
  if (falling > rising) return "falling" as const;
  return "steady" as const;
}

function calculateGeneral(player: OverallPlayer, values: Record<OverallRole, number>, goalkeeperRounds: number, goalkeeperGames: number, confidence: number, config: OverallFormulaConfig) {
  if (config.topThreeOverall) {
    const rawOverall = generalOverallItems(values, goalkeeperGames, config)
      .reduce((total, item, index) => total + item.value * [0.5, 0.35, 0.15][index], 0);
    return roundOverall(config.overallConfidenceShrink
      ? config.base + (rawOverall - config.base) * confidence
      : rawOverall);
  }
  const lineOverall = calculateLineOverall(player, values, config);
  // O atributo GOL continua sendo calculado para qualquer pessoa que tenha
  // atuado ali. Ele só pode compor o OVR principal quando o ADM marcou o
  // atleta como goleiro; rodízios no gol não podem sobrescrever DEF/VOL, ALA
  // ou ATA de jogadores de linha.
  const rawOverall = player.isGoalkeeper && goalkeeperRounds >= config.goalkeeperEligibilityRounds
    ? Math.max(lineOverall, values.GOL)
    : lineOverall;
  // A nota pública só se afasta de 70 na proporção da amostra. Isso impede
  // que uma rodada excelente coloque um estreante acima de veteranos.
  return roundOverall(config.overallConfidenceShrink
    ? config.base + (rawOverall - config.base) * confidence
    : rawOverall);
}

function cloneSnapshot(player: OverallPlayer, state: MutablePlayerState, currentRoundIndex: number, config: OverallFormulaConfig): PlayerOverallSnapshot {
  const positions = Object.fromEntries(ROLES.map((role) => {
    const estimate = positionEstimate(player, state, role, currentRoundIndex, config);
    return [role, {
      role,
      value: roundOverall(state.values[role] + estimate.seedBonus),
      confidence: roundOverall(estimate.confidence),
      validRounds: estimate.validRounds,
    }];
  })) as Record<OverallRole, OverallPositionSnapshot>;
  const positionTrends = Object.fromEntries(ROLES.map((role) => [role, positionTrend(state, role, config)])) as Record<OverallRole, OverallTrend>;
  const roundsPlayed = state.playedRoundIds.size;
  const goalkeeperRounds = state.goalkeeperRoundIds.size;
  const goalkeeperGames = state.goalkeeperMatchIds.size;
  const overallConfidence = Math.max(positions.DEF.confidence, positions.ALA_MEI.confidence, positions.ATA.confidence);
  return {
    playerId: player.id,
    overall: calculateGeneral(player, state.values, goalkeeperRounds, goalkeeperGames, overallConfidence, config),
    positions,
    trend: overallTrend(player, positionTrends, state.values, goalkeeperRounds, goalkeeperGames, config),
    positionTrends,
    roundsPlayed,
    goalkeeperRounds,
    goalkeeperGames,
    isProvisional: roundsPlayed < config.confidenceRounds
      || (config.provisionalAtConfidenceThreshold && roundsPlayed === config.confidenceRounds),
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
        rate: perSevenMinuteRate(appearance.teamGoalsConceded, appearance.matchSeconds || MAX_MATCH_SECONDS),
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
  const stateByPlayerId = new Map<string, MutablePlayerState>(players.map((player) => [player.id, createPlayerState(formula)]));
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
    // A referência precisa existir antes da rodada atual; incluir o próprio
    // placar suavizaria artificialmente uma atuação muito boa ou muito ruim.
    const recentSamples = historicalConcededRates
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
      const roundScores = calculateRoundScores(appearances, formula);
      let defensiveTotal = 0;
      let defensiveWeight = 0;
      let timingQuality: GoalTimingQuality = "exact";
      let goalsConceded = 0;
      for (const appearance of appearances) {
        goalsConceded += Number(appearance.goalsConceded || 0);
        if (appearance.goalTimingQuality === "fallback") timingQuality = "fallback";
        for (const role of ROLES) {
          const outcome = calculateMatchScore(
            role,
            player,
            appearance,
            baselineConcededRate,
            roundScores,
            roundScores.collectiveScore,
            formula,
          );
          if (outcome === null) continue;
          state.history.push({
            roundId: round.id,
            roundIndex,
            role,
            score: outcome.score,
            secondsPlayed: exposure(appearance.secondsPlayed),
            evidenceWeight: outcome.evidenceWeight,
          });
          if (role === "DEF") {
            const weight = exposure(appearance.secondsPlayed);
            defensiveTotal += outcome.defensiveScore * weight;
            defensiveWeight += weight;
          }
        }
      }
      state.scoutTotals.goals += roundScores.totals.goals;
      state.scoutTotals.assists += roundScores.totals.assists;
      state.scoutTotals.ownGoals += roundScores.totals.ownGoals;
      state.playedRoundIds.add(round.id);
      if (appearances.some((appearance) => appearance.isGoalkeeper)) state.goalkeeperRoundIds.add(round.id);
      for (const appearance of appearances) {
        if (appearance.isGoalkeeper) state.goalkeeperMatchIds.add(appearance.matchId);
      }
      state.lastRoundId = round.id;
      state.lastRoundIndex = roundIndex;

      for (const role of ROLES) {
        const estimate = positionEstimate(player, state, role, roundIndex, formula);
        const previous = state.values[role];
        const changeScale = formula.traitWeightedChange
          ? traitEvidenceWeight(player, role, formula)
          : 1;
        const positionForm = positionTrend(state, role, formula);
        let maximumChange = (formula.maxChangePerRound
          + Math.abs(estimate.target - formula.base) * formula.performanceChangeBonus)
          * changeScale
          * traitProgressionMultiplier(player, role, formula);
        if (estimate.target > previous && positionForm === "rising") {
          maximumChange *= 1 + formula.trendUpwardMultiplier;
        } else if (estimate.target < previous && positionForm === "falling") {
          maximumChange *= 1 + formula.trendDownwardMultiplier;
        }
        const upperLimit = formula.hardPositionCapsEnabled
          ? provisionalPositionCap(estimate.validRounds, formula) - estimate.seedBonus
          : 99;
        state.values[role] = roundOverall(clamp(
          estimate.target,
          previous - maximumChange,
          Math.min(previous + maximumChange, upperLimit),
        ));
      }
      const snapshot = cloneSnapshot(player, state, roundIndex, formula);
      const playedProfile = appearances.find((appearance) => appearance.playerProfileLocked)?.playerProfileLocked || null;
      breakdowns.push({
        playerId,
        roundId: round.id,
        roundDate: round.date,
        roundIndex,
        goals: roundScores.totals.goals,
        assists: roundScores.totals.assists,
        ownGoals: roundScores.totals.ownGoals,
        goalsConceded,
        attackingScore: roundScores.attackingScore,
        goalScore: roundScores.goalScore,
        assistScore: roundScores.assistScore,
        defensiveScore: defensiveWeight ? defensiveTotal / defensiveWeight : 0.5,
        timingQuality,
        playedProfile,
        roleEvidence: Object.fromEntries(ROLES.map((role) => [role, roleEvidenceWeight(playedProfile, role, formula)])) as Record<OverallRole, number>,
        traitEvidence: Object.fromEntries(ROLES.map((role) => [role, traitEvidenceWeight(player, role, formula)])) as Record<OverallRole, number>,
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
