import { BQ_SCORING_V5 } from "../bq-scoring";

export type FantasySettings = {
  /** Versão do motor de mercado congelada no snapshot da rodada. */
  marketVersion?: number;
  /** Rodada 2 em diante ativa o sistema de vagas, rodízio e mercado 65/35. */
  roleScoringActive?: boolean;
  /** Exceção pontual por rodada: mantém scouts brutos e punição, mas zera recompensas de goleiro. */
  suppressGoalkeeperRewards?: boolean;
  currencyName: string;
  initialBudget: number;
  initialPlayerPrice: number;
  minPlayerPrice: number;
  maxPlayerPrice: number;
  goalPoints: number;
  assistPoints: number;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  goalConcededPoints: number;
  goalkeeperAppearancePoints: number;
  ownGoalPoints: number;
  captainMultiplier: number;
  topScorerPredictionPoints: number;
  topAssistPredictionPoints: number;
  topTeamPredictionPoints: number;
  kingOfWinsPoints: number;
  mvpPredictionPoints: number;
  betOfRoundPoints: number;
  betRequiredRanks: [number, number, number, number];
  scoreGoalRewards: [number, number, number, number];
  recentWeight: number;
  winRateWeight: number;
  historicalWeight: number;
  consistencyWeight: number;
  smoothingGames: number;
  maxPriceIncrease: number;
  maxPriceDecrease: number;
  marketUpShare: number;
  marketStableShare: number;
  marketMinIncrease: number;
  marketMinDecrease: number;
  /** Piso e teto de equilíbrio da curva de preço do Mercado V10. */
  competitivePriceFloor?: number;
  competitivePriceCeiling?: number;
  /** Expoente que mantém o atleta mediano perto do preço inicial. */
  competitivePriceCurve?: number;
  /** Peso da rodada atual; o restante vem da média da temporada. */
  marketRoundWeight?: number;
  /** Legado do Mercado V9; mantido para ler snapshots antigos. */
  marketAttendanceWeight?: number;
  /** Parcela da distância até o preço-alvo percorrida a cada rodada. */
  marketRepriceStrength?: number;
  /** Limites iniciais e passo de maturação da variação por rodada. */
  marketInitialUpCap?: number;
  marketInitialDownCap?: number;
  marketCapStep?: number;
  /** Mercado V11: dificuldade global baseada na capacidade real de compra da liga. */
  marketDifficultyMultiplier?: number;
  marketDifficultyMin?: number;
  marketDifficultyMax?: number;
  marketDifficultyStep?: number;
  marketTargetEliteAffordability?: number;
  marketTargetMedianEliteRatio?: number;
  marketRecoveryBonusStrength?: number;
  marketExpensiveRiskStrength?: number;
  marketBreakoutRepriceStrength?: number;
  marketCheapPercentile?: number;
  marketElitePercentile?: number;
  marketBreakoutRoundPercentile?: number;
  marketBadRoundPercentile?: number;
  /** Freio de inflação do patrimônio ao longo da temporada. */
  budgetSoftCapMultiplier?: number;
  budgetHardCapMultiplier?: number;
  budgetExcessRetention?: number;
  minSampleForRadar?: number;
  // Campos legados preservados para compatibilidade com snapshots antigos
  attackerGoalPoints?: number;
  goalkeeperLossPoints?: number;
  teamGoalConcededPoints?: number;
  goalkeeperSlotCleanSheetPoints?: number;
  defCleanSheetBonus?: number;
  defOneGoalBonus?: number;
  defMuralhaThreshold?: number;
  defMuralhaBonus?: number;
  defBonusCap?: number;
  meiAssistBonus?: number;
  meiMaestroThreshold?: number;
  meiMaestroBonus?: number;
  meiBonusCap?: number;
  alaGoalBonus?: number;
  alaAssistBonus?: number;
  alaCleanSheetBonus?: number;
  alaOneGoalBonus?: number;
  alaAttackThreshold?: number;
  alaDefenseThreshold?: number;
  alaVaiEVoltaBonus?: number;
  alaBonusCap?: number;
  ataGoalBonus?: number;
  ataArtilheiroThreshold?: number;
  ataArtilheiroBonus?: number;
  ataBonusCap?: number;
};

export const DEFAULT_FANTASY_SETTINGS: FantasySettings = {
  marketVersion: 11,
  roleScoringActive: true,
  suppressGoalkeeperRewards: false,
  currencyName: "C$",
  initialBudget: 55,
  initialPlayerPrice: 10,
  minPlayerPrice: 5,
  maxPlayerPrice: 20,
  // Scouts básicos BQ v5 — sincronizados com bq-scoring.ts
  goalPoints: BQ_SCORING_V5.goal,
  assistPoints: BQ_SCORING_V5.assist,
  winPoints: BQ_SCORING_V5.win,
  drawPoints: BQ_SCORING_V5.draw,
  lossPoints: BQ_SCORING_V5.loss,
  goalConcededPoints: BQ_SCORING_V5.goalkeeperGoalConceded,
  goalkeeperAppearancePoints: BQ_SCORING_V5.goalkeeperAppearance,
  ownGoalPoints: BQ_SCORING_V5.ownGoal,
  captainMultiplier: 1.5,
  topScorerPredictionPoints: 8,
  topAssistPredictionPoints: 6,
  topTeamPredictionPoints: 5,
  kingOfWinsPoints: 6,
  mvpPredictionPoints: 8,
  betOfRoundPoints: 8,
  betRequiredRanks: [5, 4, 3, 2],
  scoreGoalRewards: [7, 6, 4, 3],
  recentWeight: 0.40,
  winRateWeight: 0.35,
  historicalWeight: 0.15,
  consistencyWeight: 0.10,
  smoothingGames: 5,
  maxPriceIncrease: 0.15,
  maxPriceDecrease: 0.12,
  marketUpShare: 0.35,
  marketStableShare: 0.30,
  marketMinIncrease: 0.05,
  marketMinDecrease: 0.02,
  competitivePriceFloor: 6,
  competitivePriceCeiling: 18,
  competitivePriceCurve: 1.9,
  marketRoundWeight: 0.70,
  marketAttendanceWeight: 0,
  marketRepriceStrength: 0.26,
  marketInitialUpCap: 0.08,
  marketInitialDownCap: 0.06,
  marketCapStep: 0.02,
  marketDifficultyMultiplier: 1,
  marketDifficultyMin: 0.94,
  marketDifficultyMax: 1.18,
  marketDifficultyStep: 0.03,
  marketTargetEliteAffordability: 0.20,
  marketTargetMedianEliteRatio: 0.86,
  marketRecoveryBonusStrength: 2.40,
  marketExpensiveRiskStrength: 1.20,
  marketBreakoutRepriceStrength: 0.40,
  marketCheapPercentile: 0.35,
  marketElitePercentile: 0.80,
  marketBreakoutRoundPercentile: 0.70,
  marketBadRoundPercentile: 0.35,
  budgetSoftCapMultiplier: 1.20,
  budgetHardCapMultiplier: 1.40,
  budgetExcessRetention: 0.25,
  minSampleForRadar: 3,
  // Campos legados — preservados para snapshots antigos
  attackerGoalPoints: BQ_SCORING_V5.goal,
  goalkeeperLossPoints: BQ_SCORING_V5.loss,
  teamGoalConcededPoints: 0,
  goalkeeperSlotCleanSheetPoints: 4,
  defCleanSheetBonus: 1.25,
  defOneGoalBonus: 0.5,
  defMuralhaThreshold: 3,
  defMuralhaBonus: 2.5,
  defBonusCap: 8,
  meiAssistBonus: 0.75,
  meiMaestroThreshold: 2,
  meiMaestroBonus: 2.5,
  meiBonusCap: 6,
  alaGoalBonus: 0.5,
  alaAssistBonus: 0.5,
  alaCleanSheetBonus: 0.5,
  alaOneGoalBonus: 0.25,
  alaAttackThreshold: 2,
  alaDefenseThreshold: 2,
  alaVaiEVoltaBonus: 2,
  alaBonusCap: 6,
  ataGoalBonus: 0.5,
  ataArtilheiroThreshold: 2,
  ataArtilheiroBonus: 2,
  ataBonusCap: 4,
};

export const FANTASY_RECENT_ROUND_WEIGHTS = [0.40, 0.25, 0.15, 0.12, 0.08] as const;

const POSITION_SNAPSHOT_KEYS = {
  defCleanSheetBonus: "def_clean_sheet_bonus",
  defOneGoalBonus: "def_one_goal_bonus",
  defMuralhaThreshold: "def_muralha_threshold",
  defMuralhaBonus: "def_muralha_bonus",
  defBonusCap: "def_bonus_cap",
  meiAssistBonus: "mei_assist_bonus",
  meiMaestroThreshold: "mei_maestro_threshold",
  meiMaestroBonus: "mei_maestro_bonus",
  meiBonusCap: "mei_bonus_cap",
  alaGoalBonus: "ala_goal_bonus",
  alaAssistBonus: "ala_assist_bonus",
  alaCleanSheetBonus: "ala_clean_sheet_bonus",
  alaOneGoalBonus: "ala_one_goal_bonus",
  alaAttackThreshold: "ala_attack_threshold",
  alaDefenseThreshold: "ala_defense_threshold",
  alaVaiEVoltaBonus: "ala_vai_e_volta_bonus",
  alaBonusCap: "ala_bonus_cap",
  ataGoalBonus: "ata_goal_bonus",
  ataArtilheiroThreshold: "ata_artilheiro_threshold",
  ataArtilheiroBonus: "ata_artilheiro_bonus",
  ataBonusCap: "ata_bonus_cap",
} as const satisfies Partial<Record<keyof FantasySettings, string>>;

export function withFantasyPositionSnapshot(
  base: FantasySettings,
  snapshot?: Record<string, unknown> | null,
): FantasySettings {
  if (!snapshot) return base;
  const version = Number(snapshot.scoring_version ?? snapshot.version ?? 5);
  const result: FantasySettings = version < 6
    ? {
        ...base,
        defCleanSheetBonus: 1.5,
        defOneGoalBonus: 0.5,
        defMuralhaThreshold: 3,
        defMuralhaBonus: 3,
        defBonusCap: 10,
        meiAssistBonus: 1,
        meiMaestroThreshold: 2,
        meiMaestroBonus: 3,
        meiBonusCap: Number.MAX_SAFE_INTEGER,
        alaGoalBonus: 0,
        alaAssistBonus: 0,
        alaCleanSheetBonus: 0,
        alaOneGoalBonus: 0,
        alaVaiEVoltaBonus: 0,
        alaBonusCap: 0,
        ataGoalBonus: 0,
        ataArtilheiroThreshold: 2,
        ataArtilheiroBonus: 3,
        ataBonusCap: Number.MAX_SAFE_INTEGER,
      }
    : { ...base };
  for (const [camelKey, snakeKey] of Object.entries(POSITION_SNAPSHOT_KEYS)) {
    const key = camelKey as keyof typeof POSITION_SNAPSHOT_KEYS;
    const fallback = base[key];
    const value = snapshot[snakeKey] ?? snapshot[key];
    if (value !== undefined && value !== null && typeof fallback === "number") {
      (result as unknown as Record<string, unknown>)[key] = Number(value);
    }
  }
  return result;
}

/** O orçamento inicial acompanha a quantidade de vagas, mantendo C$ 11 por atleta. */
export function getFantasyInitialBudget(playersPerTeam: number) {
  return Math.max(1, Math.floor(playersPerTeam || 5)) * 11;
}

export function formatFantasyMoney(value: number, currencyName = "C$") {
  return `${currencyName} ${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}
