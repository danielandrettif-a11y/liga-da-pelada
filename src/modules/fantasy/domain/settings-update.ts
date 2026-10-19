import type { FantasySettings } from "@/lib/fantasy/config";

const CANONICAL_SCOUT_KEYS = [
  "goalPoints",
  "assistPoints",
  "winPoints",
  "drawPoints",
  "lossPoints",
  "ownGoalPoints",
  "goalkeeperAppearancePoints",
  "goalConcededPoints",
] as const satisfies readonly (keyof FantasySettings)[];

export function buildFantasySettingsPayload(values: Partial<FantasySettings>) {
  if (CANONICAL_SCOUT_KEYS.some((key) => values[key] !== undefined)) {
    return {
      error: "Edite os oito scouts juntos na tela Pontuação BQ para manter Ranked e Cartola sincronizados.",
    } as const;
  }
  const {
    attackerGoalPoints: _legacyAttackerGoalPoints,
    ownGoalPoints: _ownGoalPoints,
    lossPoints: _lossPoints,
    goalkeeperLossPoints: _goalkeeperLossPoints,
    goalkeeperAppearancePoints: _goalkeeperAppearancePoints,
    goalConcededPoints: _goalConcededPoints,
    teamGoalConcededPoints: _teamGoalConcededPoints,
    defenderOneGoalConcededPoints,
    defenderTwoGoalsConcededPoints,
    ...otherValues
  } = values;
  const payload = Object.fromEntries(
    Object.entries(otherValues).filter(([, value]) => value !== undefined),
  ) as Record<string, unknown>;
  if (defenderOneGoalConcededPoints !== undefined) {
    payload.defender_one_goal_conceded_points = defenderOneGoalConcededPoints;
  }
  if (defenderTwoGoalsConcededPoints !== undefined) {
    payload.defender_two_goals_conceded_points = defenderTwoGoalsConcededPoints;
  }
  return { payload } as const;
}
