import { validateDeleteGoalInput } from "../domain/register-goal";

export type DeletedLiveGoal = {
  deleted?: boolean;
  score_a?: number;
  score_b?: number;
  round_id?: string;
} | null;

export type DeleteLiveGoalGateway = {
  ensureMatchSelected(matchId: string): Promise<void>;
  eventBelongsToMatch(eventId: string, matchId: string): Promise<boolean>;
  deleteGoal(eventId: string, matchId: string): Promise<DeletedLiveGoal>;
};

export async function deleteLiveGoal(
  eventId: string,
  matchId: string,
  gateway: DeleteLiveGoalGateway,
) {
  const validationError = validateDeleteGoalInput(eventId, matchId);
  if (validationError) return { success: false as const, error: validationError };

  await gateway.ensureMatchSelected(matchId);
  if (!(await gateway.eventBelongsToMatch(eventId, matchId))) {
    return { success: false as const, error: "Gol fora da partida selecionada." };
  }

  const result = await gateway.deleteGoal(eventId, matchId);
  return {
    success: true as const,
    roundId: result?.round_id,
    scoreA: result?.score_a,
    scoreB: result?.score_b,
  };
}
