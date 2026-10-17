export type CallupPlayersGateway = {
  addAsAdmin(callupId: string, playerId: string): Promise<{
    status?: "confirmed" | "waitlist";
    error: string | null;
  }>;
  addAsMember(callupId: string, playerId: string): Promise<string | null>;
  removeAsAdmin(callupId: string, playerId: string): Promise<string | null>;
  notifyWithdrawal(callupId: string, playerId: string): Promise<void>;
};

export type AddCallupPlayerResult =
  | { success: true; status?: "confirmed" | "waitlist" }
  | { success: false; error: string };

export type RemoveCallupPlayerResult = { success: true } | { success: false; error: string };

export async function addOtherCallupPlayer(
  callupId: string,
  playerId: string,
  mode: "admin" | "member",
  gateway: CallupPlayersGateway,
): Promise<AddCallupPlayerResult> {
  if (mode === "admin") {
    const { status, error } = await gateway.addAsAdmin(callupId, playerId);
    return error ? { success: false, error } : { success: true, status };
  }
  const error = await gateway.addAsMember(callupId, playerId);
  return error ? { success: false, error } : { success: true };
}

export async function removeOtherCallupPlayerAsAdmin(
  callupId: string,
  playerId: string,
  gateway: CallupPlayersGateway,
): Promise<RemoveCallupPlayerResult> {
  const error = await gateway.removeAsAdmin(callupId, playerId);
  if (error) return { success: false, error };
  await gateway.notifyWithdrawal(callupId, playerId);
  return { success: true };
}
