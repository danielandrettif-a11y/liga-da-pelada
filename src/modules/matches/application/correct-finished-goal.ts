import {
  type FinishedGoalCorrectionInput,
  validateFinishedGoalCorrection,
} from "../domain/finished-goal-correction";

export type FinishedGoalScope = { matchId: string; roundId: string };
export type FinishedGoalMutation = { match_id?: string; round_id?: string } | null;

export type FinishedGoalCorrectionGateway = {
  loadEventScope(eventId: string): Promise<FinishedGoalScope>;
  loadMatchScope(matchId: string): Promise<FinishedGoalScope>;
  removeGoal(eventId: string): Promise<FinishedGoalMutation>;
  editGoal(eventId: string, playerId: string, assistPlayerId: string | null): Promise<FinishedGoalMutation>;
  addGoal(matchId: string, teamId: string, playerId: string, assistPlayerId: string | null): Promise<FinishedGoalMutation>;
  hasFantasyRound(roundId: string): Promise<boolean>;
  reprocessFantasy(roundId: string): Promise<void>;
};

export type FinishedGoalCorrectionEffects = {
  recalculateStats(roundId: string): Promise<{ success: boolean; error?: string }>;
  refreshOverall(roundId: string): Promise<void>;
};

export async function correctFinishedGoalInMatch(
  input: FinishedGoalCorrectionInput,
  gateway: FinishedGoalCorrectionGateway,
  effects: FinishedGoalCorrectionEffects,
) {
  const validationError = validateFinishedGoalCorrection(input);
  if (validationError) return { success: false as const, error: validationError };

  const selected = input.kind === "add"
    ? await gateway.loadMatchScope(input.matchId)
    : await gateway.loadEventScope(input.eventId);

  // Cada RPC altera o gol, o placar e a auditoria em uma transacao. As
  // estatisticas derivadas rodam depois, em requisicoes separadas.
  let mutation: FinishedGoalMutation;
  switch (input.kind) {
    case "remove":
      mutation = await gateway.removeGoal(input.eventId);
      break;
    case "edit":
      mutation = await gateway.editGoal(input.eventId, input.playerId, input.assistPlayerId);
      break;
    case "add":
      mutation = await gateway.addGoal(input.matchId, input.teamId, input.playerId, input.assistPlayerId);
      break;
  }

  const matchId = mutation?.match_id || selected.matchId;
  const roundId = mutation?.round_id || selected.roundId;
  let warning: string | undefined;
  try {
    const stats = await effects.recalculateStats(roundId);
    if (!stats.success) throw new Error(stats.error || "Não foi possível recalcular as estatísticas.");
    if (await gateway.hasFantasyRound(roundId)) await gateway.reprocessFantasy(roundId);
    await effects.refreshOverall(roundId);
  } catch (error) {
    // A RPC ja confirmou a mutacao. Nunca orientar o ADM a repeti-la por causa
    // de uma falha posterior de Ranking/Cartola/Overall.
    warning = error instanceof Error ? error.message : "Reprocessamento pendente.";
  }

  return { success: true as const, matchId, roundId, warning };
}
