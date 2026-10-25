import { validateGoalCommand, type GoalCommand, type GoalReceipt } from "../domain/goal.js";

export type Actor = { userId: string };

export interface GoalRepository {
  /** Confirma a RPC e o recibo na mesma transação, sob a identidade do ator. */
  registerGoal(command: GoalCommand, actor: Actor): Promise<GoalReceipt>;
}

export async function registerGoal(
  command: GoalCommand,
  actor: Actor,
  repository: GoalRepository,
): Promise<GoalReceipt> {
  validateGoalCommand(command);
  return repository.registerGoal(command, actor);
}
