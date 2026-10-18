import type { SubstituteMatchPlayerInput } from "@/lib/types";
import { checkIncomingSubstitute, validateMatchSubstitutionInput } from "../domain/match-substitution";

export type MatchSubstitutionGateway = {
  loadSelectedMatchRoundId(matchId: string): Promise<string>;
  loadIncomingContext(matchId: string, playerId: string): Promise<{
    found: boolean;
    formationMode: string | null;
    attendanceStatus: string | null;
  }>;
  substitute(input: SubstituteMatchPlayerInput): Promise<string>;
};

export async function substitutePlayerInMatch(
  input: SubstituteMatchPlayerInput,
  gateway: MatchSubstitutionGateway,
) {
  const validationError = validateMatchSubstitutionInput(input);
  if (validationError) return { success: false as const, error: validationError };

  const roundId = await gateway.loadSelectedMatchRoundId(input.match_id);
  if (input.player_in_id) {
    const incoming = await gateway.loadIncomingContext(input.match_id, input.player_in_id);
    const eligibilityError = checkIncomingSubstitute(incoming);
    if (eligibilityError) return { success: false as const, error: eligibilityError };
  }

  const substitutionId = await gateway.substitute(input);
  return { success: true as const, substitutionId, roundId };
}
