import { cleanCallupGuestName } from "../domain/callup-guests";
import { MAX_CALLUP_GUEST_LIST_SIZE, type ParsedCallupGuest } from "../domain/callup-guest-list";
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

export type InviteGuestListResult = {
  success: boolean;
  created: number;
  confirmed: number;
  waitlisted: number;
  failed: Array<{ name: string; error: string }>;
  error?: string;
};

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

export async function inviteCallupGuestList(
  input: { callupId: string; guests: ParsedCallupGuest[]; playerProfile: GuestProfile },
  gateway: CallupGuestGateway,
): Promise<InviteGuestListResult> {
  if (input.guests.length === 0) {
    return { success: false, created: 0, confirmed: 0, waitlisted: 0, failed: [], error: "Cole pelo menos um nome válido." };
  }
  if (input.guests.length > MAX_CALLUP_GUEST_LIST_SIZE) {
    return {
      success: false,
      created: 0,
      confirmed: 0,
      waitlisted: 0,
      failed: [],
      error: `Importe no máximo ${MAX_CALLUP_GUEST_LIST_SIZE} nomes por vez.`,
    };
  }

  let confirmed = 0;
  let waitlisted = 0;
  const failed: Array<{ name: string; error: string }> = [];

  // Mantém a ordem copiada do WhatsApp: ela também define a ordem de entrada
  // entre titulares e fila de espera no RPC transacional de cada convidado.
  for (const guest of input.guests) {
    const result = await inviteCallupGuest({
      callupId: input.callupId,
      name: guest.name,
      playerProfile: input.playerProfile,
      isGoalkeeper: guest.isGoalkeeper,
    }, gateway);
    if (!result.success) {
      failed.push({ name: guest.name, error: result.error });
    } else if (result.isConfirmed) {
      confirmed += 1;
    } else {
      waitlisted += 1;
    }
  }

  const created = confirmed + waitlisted;
  return {
    success: created > 0,
    created,
    confirmed,
    waitlisted,
    failed,
    error: created === 0 ? failed[0]?.error || "Não foi possível adicionar os convidados." : undefined,
  };
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
