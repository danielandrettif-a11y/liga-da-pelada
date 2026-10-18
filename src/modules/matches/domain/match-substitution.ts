import type { SubstituteMatchPlayerInput } from "@/lib/types";

export function validateMatchSubstitutionInput(input: SubstituteMatchPlayerInput): string | null {
  return !input.match_id || !input.team_id || !input.player_out_id
    ? "Preencha os dados da substituicao."
    : null;
}

export function validateUndoMatchSubstitutionInput(substitutionId: string, matchId: string): string | null {
  return !substitutionId || !matchId ? "Substituicao invalida." : null;
}

export function checkIncomingSubstitute(
  incoming: { found: boolean; formationMode: string | null; attendanceStatus: string | null },
): string | null {
  if (!incoming.found) return "Substituto nao encontrado nesta rodada.";
  if (incoming.formationMode !== "manual" && incoming.attendanceStatus !== "present") {
    return "O substituto ainda nao foi marcado como presente.";
  }
  return null;
}
