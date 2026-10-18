export type FinishedGoalCorrectionInput =
  | { kind: "remove"; eventId: string; confirmation: string }
  | { kind: "edit"; eventId: string; playerId: string; assistPlayerId: string | null; confirmation: string }
  | { kind: "add"; matchId: string; teamId: string; playerId: string; assistPlayerId: string | null; confirmation: string };

export function validateFinishedGoalCorrection(input: FinishedGoalCorrectionInput): string | null {
  if (input.confirmation !== "EDITAR") {
    return "Digite EDITAR para liberar correções em partidas finalizadas.";
  }
  if (input.kind === "edit" && (!input.eventId || !input.playerId)) {
    return "Escolha o autor do gol.";
  }
  if (input.kind === "add" && (!input.matchId || !input.teamId || !input.playerId)) {
    return "Escolha o time e o autor do gol.";
  }
  return null;
}
