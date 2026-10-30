export const FORMULA_KEY = "adaptive-v20-statistical-confidence";
export const COMPARISON_FORMULA_KEY = "adaptive-v19-admin-fixed-profile";

export type OverallRole = "DEF" | "ALA_MEI" | "ATA" | "GOL";
export type PositionMap = Record<OverallRole, number>;
export type TrendDirection = "rising" | "steady" | "falling";

export type RecentRoundBreakdown = {
  date: string;
  goals: number;
  assists: number;
  goalsConceded: number;
  attackingScore: number;
  goalScore: number;
  assistScore: number;
  defensiveScore: number;
  timingQuality: "exact" | "fallback";
  playedProfile: string | null;
  traitEvidence: PositionMap;
  positions: PositionMap;
};

export type OverallShadowSnapshot = {
  playerId: string;
  playerName: string;
  overall: number;
  def: number;
  alaMei: number;
  ata: number;
  gol: number;
  confidence: number;
  positionConfidence: PositionMap;
  provisional: boolean;
  stale: boolean;
  roundsPlayed: number;
  goals: number;
  assists: number;
  seedMode: "legacy_tag" | "observed";
  recentRounds: RecentRoundBreakdown[];
  trend: TrendDirection;
  positionTrends: Record<OverallRole, TrendDirection>;
  effectiveProfile: "defensive" | "offensive";
  profileSource: "initial" | "overall";
  comparison: {
    overallDelta: number;
    defDelta: number;
    alaMeiDelta: number;
    ataDelta: number;
    golDelta: number;
  } | null;
};

export type OverallShadowRun = {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  formulaLabel: string;
};

export type OverallShadowAdminData = {
  latestRun: OverallShadowRun | null;
  pendingPlayers: Array<{ id: string; name: string }>;
  snapshots: OverallShadowSnapshot[];
};

export function numberValue(value: unknown): number {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

export function buildOverallShadowAdminData(params: {
  latestRun: {
    id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    error_message: string | null;
  } | null;
  formulaLabel: string;
  pendingPlayers: Array<{ id: string; name: string }>;
  snapshots: Array<Record<string, any>>;
  breakdowns: Array<Record<string, any>>;
  comparisonSnapshots?: Array<Record<string, any>>;
}): OverallShadowAdminData {
  if (!params.latestRun) {
    return {
      latestRun: null,
      pendingPlayers: params.pendingPlayers,
      snapshots: [],
    };
  }

  const roundsByPlayer = new Map<string, any[]>();
  for (const row of params.breakdowns || []) {
    const playerId = String(row.player_id || "");
    const current = roundsByPlayer.get(playerId) || [];
    if (current.length < 8) current.push(row);
    roundsByPlayer.set(playerId, current);
  }

  const comparisonByPlayer = new Map(
    (params.comparisonSnapshots || []).map((row: any) => [String(row.player_id || ""), row]),
  );

  const defaultPositionMap: PositionMap = { DEF: 0, ALA_MEI: 0, ATA: 0, GOL: 0 };

  const snapshots: OverallShadowSnapshot[] = (params.snapshots || []).map((row: any) => {
    const playerId = String(row.player_id || "");
    const dataQuality = row.data_quality || {};
    const previous = comparisonByPlayer.get(playerId);

    const posConfidence: PositionMap = {
      DEF: numberValue(dataQuality.position_confidence?.DEF),
      ALA_MEI: numberValue(dataQuality.position_confidence?.ALA_MEI),
      ATA: numberValue(dataQuality.position_confidence?.ATA),
      GOL: numberValue(dataQuality.position_confidence?.GOL),
    };

    const posTrends: Record<OverallRole, TrendDirection> = {
      DEF: dataQuality.position_trends?.DEF === "rising" || dataQuality.position_trends?.DEF === "falling" ? dataQuality.position_trends.DEF : "steady",
      ALA_MEI: dataQuality.position_trends?.ALA_MEI === "rising" || dataQuality.position_trends?.ALA_MEI === "falling" ? dataQuality.position_trends.ALA_MEI : "steady",
      ATA: dataQuality.position_trends?.ATA === "rising" || dataQuality.position_trends?.ATA === "falling" ? dataQuality.position_trends.ATA : "steady",
      GOL: dataQuality.position_trends?.GOL === "rising" || dataQuality.position_trends?.GOL === "falling" ? dataQuality.position_trends.GOL : "steady",
    };

    const recentRounds: RecentRoundBreakdown[] = (roundsByPlayer.get(playerId) || []).map((item: any) => ({
      date: String(item.round_date || ""),
      goals: numberValue(item.goals),
      assists: numberValue(item.assists),
      goalsConceded: numberValue(item.goals_conceded),
      attackingScore: numberValue(item.attacking_score),
      goalScore: numberValue(item.goal_score),
      assistScore: numberValue(item.assist_score),
      defensiveScore: numberValue(item.defensive_score),
      timingQuality: item.timing_quality === "exact" ? "exact" : "fallback",
      playedProfile: item.played_profile || null,
      traitEvidence: item.trait_evidence || defaultPositionMap,
      positions: item.positions || defaultPositionMap,
    }));

    return {
      playerId,
      playerName: row.player?.name || "Jogador",
      overall: numberValue(row.overall),
      def: numberValue(row.def_overall),
      alaMei: numberValue(row.ala_mei_overall),
      ata: numberValue(row.ata_overall),
      gol: numberValue(row.gol_overall),
      confidence: numberValue(row.confidence),
      positionConfidence: posConfidence,
      provisional: Boolean(row.is_provisional),
      stale: Boolean(row.is_stale),
      roundsPlayed: numberValue(row.rounds_played),
      goals: numberValue(dataQuality.scout_totals?.goals),
      assists: numberValue(dataQuality.scout_totals?.assists),
      seedMode: dataQuality.seed_mode === "legacy_tag" ? "legacy_tag" : "observed",
      trend: dataQuality.overall_trend === "rising" || dataQuality.overall_trend === "falling" ? dataQuality.overall_trend : "steady",
      positionTrends: posTrends,
      effectiveProfile: dataQuality.effective_profile === "defensive" ? "defensive" : "offensive",
      profileSource: dataQuality.profile_source === "overall" ? "overall" : "initial",
      recentRounds,
      comparison: previous ? {
        overallDelta: numberValue(row.overall) - numberValue(previous.overall),
        defDelta: numberValue(row.def_overall) - numberValue(previous.def_overall),
        alaMeiDelta: numberValue(row.ala_mei_overall) - numberValue(previous.ala_mei_overall),
        ataDelta: numberValue(row.ata_overall) - numberValue(previous.ata_overall),
        golDelta: numberValue(row.gol_overall) - numberValue(previous.gol_overall),
      } : null,
    };
  });

  return {
    latestRun: {
      ...params.latestRun,
      formulaLabel: params.formulaLabel,
    },
    pendingPlayers: params.pendingPlayers,
    snapshots,
  };
}

export function validateRunForPublication(
  run: { id: string; status: string; formula_version_id: string } | null,
  expectedFormulaId: string,
): { valid: true } | { valid: false; reason: string } {
  if (!run) {
    return { valid: false, reason: "Execução não encontrada." };
  }
  if (run.formula_version_id !== expectedFormulaId) {
    return { valid: false, reason: "A execução não corresponde à fórmula v20 ativa." };
  }
  if (run.status !== "succeeded") {
    return { valid: false, reason: "Escolha um rascunho v20 concluído e ainda não publicado." };
  }
  return { valid: true };
}

