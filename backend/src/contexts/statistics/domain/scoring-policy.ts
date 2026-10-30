export type BQBaseScoringSnapshot = {
  version: number;
  goal: number;
  assist: number;
  win: number;
  draw: number;
  loss: number;
  ownGoal: number;
  goalkeeperAppearance: number;
  goalkeeperGoalConceded: number;
  defenderGoal?: number;
  defenderAssist?: number;
  defenderCleanSheet?: number;
  defenderOneGoal?: number;
  defenderOneGoalConceded?: number;
  defenderTwoGoalsConceded?: number;
  teamGoalConceded?: number;
  goalkeeperCleanSheet?: number;
  goalkeeperOneGoal?: number;
};

export type ColumnCScoringSettings = {
  attackerGoalPoints: number;
  attackerAssistPoints: number;
  lineGoalConcededPoints: number;
  defenderGoalPoints: number;
  defenderAssistPoints: number;
  defenderCleanSheetPoints: number;
  defenderOneGoalPoints: number;
  defenderOneGoalConcededPoints: number;
  defenderTwoGoalsConcededPoints: number;
  goalkeeperSlotAppearancePoints: number;
  goalkeeperSlotGoalConcededPoints: number;
  goalkeeperSlotCleanSheetPoints: number;
  goalkeeperSlotOneGoalPoints: number;
};

export const BQ_SCORING_V5: BQBaseScoringSnapshot = {
  version: 5,
  goal: 4,
  assist: 2.5,
  win: 3,
  draw: 1,
  loss: -2.5,
  ownGoal: -3,
  goalkeeperAppearance: 2,
  goalkeeperGoalConceded: -1,
} as const;

export const DEFAULT_COLUMN_C_SCORING: ColumnCScoringSettings = {
  attackerGoalPoints: 4,
  attackerAssistPoints: 2.5,
  lineGoalConcededPoints: -0.5,
  defenderGoalPoints: 5,
  defenderAssistPoints: 3,
  defenderCleanSheetPoints: 3,
  defenderOneGoalPoints: 1,
  defenderOneGoalConcededPoints: -0.75,
  defenderTwoGoalsConcededPoints: -1.75,
  goalkeeperSlotAppearancePoints: 1,
  goalkeeperSlotGoalConcededPoints: -0.5,
  goalkeeperSlotCleanSheetPoints: 4,
  goalkeeperSlotOneGoalPoints: 2,
} as const;

export class ScoringPolicyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoringPolicyValidationError";
  }
}

export function validateBQScoringSnapshot(snapshot: unknown): BQBaseScoringSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    throw new ScoringPolicyValidationError("Snapshot de pontuação inválido.");
  }
  const s = snapshot as Record<string, unknown>;

  const fields: Array<keyof BQBaseScoringSnapshot> = [
    "goal",
    "assist",
    "win",
    "draw",
    "loss",
    "ownGoal",
    "goalkeeperAppearance",
    "goalkeeperGoalConceded",
  ];

  for (const field of fields) {
    const val = s[field];
    if (typeof val !== "number" || !Number.isFinite(val)) {
      throw new ScoringPolicyValidationError(`O scout '${String(field)}' é obrigatório e deve ser numérico.`);
    }
    if (Math.abs(val) > 100) {
      throw new ScoringPolicyValidationError(`O valor do scout '${String(field)}' excede o limite permitido (-100 a +100).`);
    }
  }

  return {
    version: typeof s.version === "number" ? s.version : 5,
    goal: Number(s.goal),
    assist: Number(s.assist),
    win: Number(s.win),
    draw: Number(s.draw),
    loss: Number(s.loss),
    ownGoal: Number(s.ownGoal),
    goalkeeperAppearance: Number(s.goalkeeperAppearance),
    goalkeeperGoalConceded: Number(s.goalkeeperGoalConceded),
    ...(typeof s.defenderGoal === "number" ? { defenderGoal: s.defenderGoal } : {}),
    ...(typeof s.defenderAssist === "number" ? { defenderAssist: s.defenderAssist } : {}),
    ...(typeof s.defenderCleanSheet === "number" ? { defenderCleanSheet: s.defenderCleanSheet } : {}),
    ...(typeof s.defenderOneGoal === "number" ? { defenderOneGoal: s.defenderOneGoal } : {}),
    ...(typeof s.defenderOneGoalConceded === "number" ? { defenderOneGoalConceded: s.defenderOneGoalConceded } : {}),
    ...(typeof s.defenderTwoGoalsConceded === "number" ? { defenderTwoGoalsConceded: s.defenderTwoGoalsConceded } : {}),
    ...(typeof s.teamGoalConceded === "number" ? { teamGoalConceded: s.teamGoalConceded } : {}),
    ...(typeof s.goalkeeperCleanSheet === "number" ? { goalkeeperCleanSheet: s.goalkeeperCleanSheet } : {}),
    ...(typeof s.goalkeeperOneGoal === "number" ? { goalkeeperOneGoal: s.goalkeeperOneGoal } : {}),
  };
}

export function validateColumnCScoringSettings(settings: unknown): ColumnCScoringSettings {
  if (!settings || typeof settings !== "object") {
    throw new ScoringPolicyValidationError("Configurações da Coluna C inválidas.");
  }
  const s = settings as Record<string, unknown>;

  const numericFields: Array<keyof ColumnCScoringSettings> = [
    "attackerGoalPoints",
    "attackerAssistPoints",
    "lineGoalConcededPoints",
    "defenderGoalPoints",
    "defenderAssistPoints",
    "defenderCleanSheetPoints",
    "defenderOneGoalPoints",
    "defenderOneGoalConcededPoints",
    "defenderTwoGoalsConcededPoints",
    "goalkeeperSlotAppearancePoints",
    "goalkeeperSlotGoalConcededPoints",
    "goalkeeperSlotCleanSheetPoints",
    "goalkeeperSlotOneGoalPoints",
  ];

  for (const field of numericFields) {
    const val = s[field];
    if (typeof val !== "number" || !Number.isFinite(val)) {
      throw new ScoringPolicyValidationError(`O campo '${String(field)}' é obrigatório e deve ser numérico.`);
    }
  }

  if (
    Number(s.lineGoalConcededPoints) > 0 ||
    Number(s.defenderOneGoalConcededPoints) > 0 ||
    Number(s.defenderTwoGoalsConcededPoints) > 0 ||
    Number(s.goalkeeperSlotGoalConcededPoints) > 0
  ) {
    throw new ScoringPolicyValidationError("Pontos por gol sofrido devem ser zero ou negativos.");
  }

  return {
    attackerGoalPoints: Number(s.attackerGoalPoints),
    attackerAssistPoints: Number(s.attackerAssistPoints),
    lineGoalConcededPoints: Number(s.lineGoalConcededPoints),
    defenderGoalPoints: Number(s.defenderGoalPoints),
    defenderAssistPoints: Number(s.defenderAssistPoints),
    defenderCleanSheetPoints: Number(s.defenderCleanSheetPoints),
    defenderOneGoalPoints: Number(s.defenderOneGoalPoints),
    defenderOneGoalConcededPoints: Number(s.defenderOneGoalConcededPoints),
    defenderTwoGoalsConcededPoints: Number(s.defenderTwoGoalsConcededPoints),
    goalkeeperSlotAppearancePoints: Number(s.goalkeeperSlotAppearancePoints),
    goalkeeperSlotGoalConcededPoints: Number(s.goalkeeperSlotGoalConcededPoints),
    goalkeeperSlotCleanSheetPoints: Number(s.goalkeeperSlotCleanSheetPoints),
    goalkeeperSlotOneGoalPoints: Number(s.goalkeeperSlotOneGoalPoints),
  };
}

export function rankingRulesToSnapshot(
  rules: Array<{ event_type: string; points: number }>,
  version = 5,
): BQBaseScoringSnapshot {
  const map = new Map(rules.map((r) => [r.event_type, Number(r.points)]));
  return {
    version,
    goal: map.get("goal") ?? BQ_SCORING_V5.goal,
    assist: map.get("assist") ?? BQ_SCORING_V5.assist,
    win: map.get("win") ?? BQ_SCORING_V5.win,
    draw: map.get("draw") ?? BQ_SCORING_V5.draw,
    loss: map.get("loss") ?? BQ_SCORING_V5.loss,
    ownGoal: map.get("own_goal") ?? BQ_SCORING_V5.ownGoal,
    goalkeeperAppearance: map.get("goalkeeper_appearance") ?? BQ_SCORING_V5.goalkeeperAppearance,
    goalkeeperGoalConceded: map.get("goal_conceded") ?? BQ_SCORING_V5.goalkeeperGoalConceded,
  };
}
