import { cleanCallupGuestName } from "../domain/callup-guests";
import { removeOtherCallupPlayerAsAdmin, type CallupPlayersGateway } from "./manage-callup-players";

export type GuestProfile = "offensive" | "midfield" | "defensive";

export type CallupGuestGateway = {
  createGuest(input: {
    callupId: string;
    name: string;
    playerProfile: GuestProfile;
    isGoalkeeper: boolean;
  }): Promise<{ status?: "confirmed" | "waitlist"; playerId?: string; error: string | null }>;
  loadCallup(callupId: string, leagueId: string): Promise<{
    callup: { status: string; roundId: string | null } | null;
    error: string | null;
  }>;
  removeCreatedEntry(callupId: string, playerId: string): Promise<string | null>;
  notifyWithdrawal(callupId: string, playerId: string): Promise<void>;
};

export type InviteGuestResult =
  | { success: true; isConfirmed: boolean; playerId?: string }
  | { success: false; error: string };

export type RemoveEntryResult =
  | { success: true; revalidateRoundId: string | null }
  | { success: false; error: string };

export async function inviteCallupGuest(
  input: { callupId: string; name: string; playerProfile: GuestProfile; isGoalkeeper: boolean },
  gateway: CallupGuestGateway,
): Promise<InviteGuestResult> {
  const name = cleanCallupGuestName(input.name);
  if (!name) return { success: false, error: "Informe o nome do seu amigo (pelo menos 2 letras)." };

  const { status, playerId, error } = await gateway.createGuest({ ...input, name });
  if (error) return { success: false, error };
  return { success: true, isConfirmed: status === "confirmed", playerId };
}

export async function removeCallupEntryForAccount(
  input: { callupId: string; playerId: string; leagueId: string; isAdmin: boolean },
  guestGateway: CallupGuestGateway,
  playersGateway: CallupPlayersGateway,
): Promise<RemoveEntryResult> {
  const { callup, error: callupError } = await guestGateway.loadCallup(input.callupId, input.leagueId);
  if (callupError || !callup) {
    return { success: false, error: callupError || "Convocação não encontrada." };
  }

  if (input.isAdmin) {
    const removed = await removeOtherCallupPlayerAsAdmin(input.callupId, input.playerId, playersGateway);
    if (!removed.success) return removed;
    return { success: true, revalidateRoundId: callup.roundId };
  }

  const removalError = await guestGateway.removeCreatedEntry(input.callupId, input.playerId);
  if (removalError) return { success: false, error: removalError };
  await guestGateway.notifyWithdrawal(input.callupId, input.playerId);
  return { success: true, revalidateRoundId: null };
}
