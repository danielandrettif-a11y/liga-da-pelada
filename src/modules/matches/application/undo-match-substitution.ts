import { validateUndoMatchSubstitutionInput } from "../domain/match-substitution";

export type UndoMatchSubstitutionGateway = {
  loadSelectedMatchRoundId(matchId: string): Promise<string>;
  isSubstitutionInMatch(substitutionId: string, matchId: string): Promise<boolean>;
  undo(substitutionId: string): Promise<void>;
};

export async function undoMatchSubstitution(
  substitutionId: string,
  matchId: string,
  gateway: UndoMatchSubstitutionGateway,
) {
  const validationError = validateUndoMatchSubstitutionInput(substitutionId, matchId);
  if (validationError) return { success: false as const, error: validationError };

  const roundId = await gateway.loadSelectedMatchRoundId(matchId);
  if (!(await gateway.isSubstitutionInMatch(substitutionId, matchId))) {
    return { success: false as const, error: "Substituição fora da partida selecionada." };
  }

  await gateway.undo(substitutionId);
  return { success: true as const, roundId };
}
