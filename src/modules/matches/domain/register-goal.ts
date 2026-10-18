import type { RegisterGoalInput } from "@/lib/types";

export function validateRegisterGoalInput(input: RegisterGoalInput): string | null {
  if (!input.match_id || !input.team_id || !input.player_id) {
    return "Dados do gol incompletos.";
  }
  return null;
}
