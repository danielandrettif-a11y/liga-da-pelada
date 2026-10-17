import { canRemoveCreatedCallupEntry, cleanCallupGuestName } from "../domain/callup-guests";
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
  loadEntry(callupId: string, playerId: string): Promise<{
    entry: { joinedBy: string | null; createdByUserId: string | null } | null;
    error: string | null;
  }>;
  deleteEntry(callupId: string, playerId: string): Promise<string | null>;
  notifyWithdrawal(callupId: string, playerId: string): Promise<void>;
  normalizePositions(callupId: string): Promise<void>;
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
  input: { callupId: string; playerId: string; leagueId: string; userId: string; isAdmin: boolean },
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

  if (callup.status !== "open") {
    return { success: false, error: "Depois do sorteio, somente o administrador pode retirar outro jogador." };
  }

  const { entry, error: entryError } = await guestGateway.loadEntry(input.callupId, input.playerId);
  if (entryError || !entry) {
    return { success: false, error: "Jogador não encontrado na convocação." };
  }
  if (!canRemoveCreatedCallupEntry(input.userId, entry)) {
    return { success: false, error: "Você só pode remover convidados cadastrados por você." };
  }

  const deleteError = await guestGateway.deleteEntry(input.callupId, input.playerId);
  if (deleteError) return { success: false, error: deleteError };
  await guestGateway.notifyWithdrawal(input.callupId, input.playerId);
  try {
    await guestGateway.normalizePositions(input.callupId);
  } catch {
    // A normalização era não bloqueante neste fluxo; a autorização final fica no banco.
  }
  return { success: true, revalidateRoundId: null };
}
