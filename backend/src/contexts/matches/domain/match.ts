const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchValidationError";
  }
}

export class MatchNotFoundError extends Error {
  constructor(message = "Partida não encontrada.") {
    super(message);
    this.name = "MatchNotFoundError";
  }
}

export function parseMatchUuid(value: string | undefined | null, fieldName: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!UUID_REGEX.test(trimmed)) {
    throw new MatchValidationError(`${fieldName} inválido.`);
  }
  return trimmed;
}

export type MatchTimerAction = "start" | "pause";
export type MatchTimerThreshold = "one_minute" | "thirty_seconds" | "finished";

export function validateTimerAction(action: string): MatchTimerAction {
  if (action !== "start" && action !== "pause") {
    throw new MatchValidationError("Ação do cronômetro inválida. Use 'start' ou 'pause'.");
  }
  return action;
}

export function validateTimerThreshold(threshold: string): MatchTimerThreshold {
  if (threshold !== "one_minute" && threshold !== "thirty_seconds" && threshold !== "finished") {
    throw new MatchValidationError("Marco de tempo inválido.");
  }
  return threshold;
}

export function validateExtraSeconds(seconds: number): number {
  if (!Number.isInteger(seconds) || seconds < -3600 || seconds > 3600) {
    throw new MatchValidationError("Acréscimo de tempo inválido.");
  }
  return seconds;
}

export function validateGoalCorrectionConfirmation(confirmation: string): void {
  if (!confirmation || confirmation.trim().toUpperCase() !== "CONFIRMAR") {
    throw new MatchValidationError("Digite CONFIRMAR para autorizar a correção do gol.");
  }
}
