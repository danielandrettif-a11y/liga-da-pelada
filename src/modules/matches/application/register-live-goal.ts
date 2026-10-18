import type { RegisterGoalInput } from "@/lib/types";
import { validateRegisterGoalInput } from "../domain/register-goal";

export type SavedGoal = {
  event_id?: string;
  idempotent?: boolean;
  score_a?: number;
  score_b?: number;
  round_id?: string;
} | null;

export type RegisterGoalGateway = {
  ensureMatchSelected(matchId: string): Promise<void>;
  saveGoal(input: RegisterGoalInput): Promise<SavedGoal>;
};

export type RegisterLiveGoalResult =
  | { success: false; error: string }
  | {
      success: true;
      roundId?: string;
      eventId?: string;
      idempotent?: boolean;
      scoreA?: number;
      scoreB?: number;
    };

export async function registerLiveGoal(
  input: RegisterGoalInput,
  gateway: RegisterGoalGateway,
): Promise<RegisterLiveGoalResult> {
  const validationError = validateRegisterGoalInput(input);
  if (validationError) return { success: false, error: validationError };

  await gateway.ensureMatchSelected(input.match_id);
  const result = await gateway.saveGoal(input);
  return {
    success: true,
    roundId: result?.round_id,
    eventId: result?.event_id,
    idempotent: result?.idempotent,
    scoreA: result?.score_a,
    scoreB: result?.score_b,
  };
}
