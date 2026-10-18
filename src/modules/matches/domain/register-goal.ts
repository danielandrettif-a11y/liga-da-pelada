import type { RegisterGoalInput } from "@/lib/types";

export function validateRegisterGoalInput(input: RegisterGoalInput): string | null {
  if (!input.match_id || !input.team_id || !input.player_id) {
    return "Dados do gol incompletos.";
  }
  return null;
}

export function validateDeleteGoalInput(eventId: string, matchId: string): string | null {
  return !eventId || !matchId ? "Identificadores inválidos para exclusão do evento." : null;
}
