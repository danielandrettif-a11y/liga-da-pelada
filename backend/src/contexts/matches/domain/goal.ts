export type GoalCommand = {
  matchId: string;
  playerId: string;
  teamId: string;
  assistPlayerId?: string | null;
  minute?: number;
  idempotencyKey: string;
  isOwnGoal?: boolean;
};

export type GoalReceipt = {
  event_id: string;
  idempotent: boolean;
  score_a: number;
  score_b: number;
  round_id: string;
};

export class GoalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalValidationError";
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateGoalCommand(command: GoalCommand): void {
  for (const value of [command.matchId, command.playerId, command.teamId]) {
    if (!uuid.test(value)) throw new GoalValidationError("Identificador inválido para o gol.");
  }
  if (command.assistPlayerId && !uuid.test(command.assistPlayerId)) {
    throw new GoalValidationError("Assistente inválido.");
  }
  if (!command.idempotencyKey.trim() || command.idempotencyKey.length > 200) {
    throw new GoalValidationError("Chave do lance inválida.");
  }
  if (command.minute !== undefined && (!Number.isInteger(command.minute) || command.minute < 0)) {
    throw new GoalValidationError("Minuto inválido.");
  }
  if (command.assistPlayerId === command.playerId) {
    throw new GoalValidationError("O autor não pode assistir o próprio gol.");
  }
  if (command.isOwnGoal && command.assistPlayerId) {
    throw new GoalValidationError("Gol contra não pode ter assistência.");
  }
}
