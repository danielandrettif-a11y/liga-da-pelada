export type CallupParticipationGateway = {
  ensurePlayerAccount(): Promise<string | null>;
  join(callupId: string): Promise<{ status?: "confirmed" | "waitlist"; error: string | null }>;
  loadRoundId(callupId: string, leagueId: string): Promise<string | null>;
  leave(callupId: string): Promise<string | null>;
  loadPlayerId(userId: string): Promise<string | null>;
  notifyWithdrawal(callupId: string, playerId: string): Promise<void>;
};

export type JoinCallupResult =
  | { success: true; status?: "confirmed" | "waitlist" }
  | { success: false; error: string };

export type LeaveCallupResult =
  | { success: true; roundId: string | null }
  | { success: false; error: string };

export async function joinSelectedCallup(
  callupId: string,
  gateway: CallupParticipationGateway,
): Promise<JoinCallupResult> {
  const profileError = await gateway.ensurePlayerAccount();
  if (profileError) return { success: false, error: profileError };
  const joined = await gateway.join(callupId);
  if (joined.error) return { success: false, error: joined.error };
  return { success: true, status: joined.status };
}

export async function leaveSelectedCallup(
  callupId: string,
  leagueId: string,
  userId: string,
  gateway: CallupParticipationGateway,
): Promise<LeaveCallupResult> {
  const roundId = await gateway.loadRoundId(callupId, leagueId);
  const leaveError = await gateway.leave(callupId);
  if (leaveError) return { success: false, error: leaveError };

  const playerId = await gateway.loadPlayerId(userId);
  if (playerId) await gateway.notifyWithdrawal(callupId, playerId);
  return { success: true, roundId };
}
