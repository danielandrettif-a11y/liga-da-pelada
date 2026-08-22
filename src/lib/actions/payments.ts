"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getAdminClient, getCurrentAccount } from "../auth";
import type { Player, RoundStatus, RoundType } from "../types";
import { getActiveSeason } from "./seasons";
import { getActiveLeague } from "./rounds";
import { findLatestReleasedPaymentRound, isPaymentChecklistComplete } from "../paymentStatus";

export type PaymentRound = {
  id: string;
  number: number;
  date: string;
  status: RoundStatus;
  round_type: RoundType;
  payment_pix: string | null;
  payment_total: number | null;
  payment_recipient_name: string | null;
};

export type PaymentRecipient = { id: string; name: string; pix_key: string; pix_type: string | null; is_active: boolean };

export async function getPaymentRecipients(includeInactive = false): Promise<PaymentRecipient[]> {
  const client = await getAdminClient();
  if (!client) return [];
  const league = await getActiveLeague();
  let query = client.from("payment_recipients").select("id, name, pix_key, pix_type, is_active").eq("league_id", league.id).order("name");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query;
  return (data || []) as PaymentRecipient[];
}

export async function savePaymentRecipient(input: { id?: string; name: string; pixKey: string; pixType?: string | null; active?: boolean }) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem gerenciar PIX." };
  const league = await getActiveLeague();
  const name = input.name.trim(); const pix = input.pixKey.trim();
  if (!name || !pix) return { success: false, error: "Informe o nome e a chave PIX." };
  const payload = { league_id: league.id, name, pix_key: pix, pix_type: input.pixType || null, is_active: input.active !== false, created_by: (await getCurrentAccount()).user?.id };
  const { error } = input.id ? await client.from("payment_recipients").update(payload).eq("id", input.id).eq("league_id", league.id) : await client.from("payment_recipients").insert(payload);
  revalidatePath("/mais/pix");
  return { success: !error, error: error?.message };
}

export async function setPaymentRecipientActive(id: string, active: boolean) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem gerenciar PIX." };
  const league = await getActiveLeague();
  const { error } = await client.from("payment_recipients").update({ is_active: active }).eq("id", id).eq("league_id", league.id);
  revalidatePath("/mais/pix");
  return { success: !error, error: error?.message };
}

export type PaymentPlayer = Player & {
  paid: boolean;
  paid_at: string | null;
};

export type PaymentAuditLogEntry = {
  id: number;
  round_id: string;
  target_player_id: string | null;
  target_player_name: string;
  paid: boolean;
  changed_by_player_id: string | null;
  changed_by_name: string;
  created_at: string;
  round: {
    id: string;
    number: number;
    date: string;
    round_type: RoundType;
  } | null;
};

export async function getPaymentRounds(): Promise<PaymentRound[]> {
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return [];

  const { data, error } = await supabase
    .from("rounds")
    .select("id, number, date, status, round_type, payment_pix, payment_total, payment_recipient_name, created_at")
    .eq("season_id", season.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar rodadas para pagamento:", error);
    return [];
  }

  return data as PaymentRound[];
}

export async function hasReleasedPaymentRound(): Promise<boolean> {
  const rounds = await getPaymentRounds();
  const latestRound = findLatestReleasedPaymentRound(rounds);
  if (!latestRound) return false;

  const { data: payments, error } = await supabase
    .from("round_payments")
    .select("paid")
    .eq("round_id", latestRound.id);
  if (error) {
    console.error("Erro ao verificar conclusao dos pagamentos:", error);
    return true;
  }
  const allPaid = isPaymentChecklistComplete(payments);
  return !allPaid;
}

export async function getRoundPaymentPlayers(roundId: string): Promise<PaymentPlayer[]> {
  const [{ data: participants, error: participantError }, { data: payments, error: paymentError }] = await Promise.all([
    supabase.from("round_players").select("player_id").eq("round_id", roundId),
    supabase.from("round_payments").select("player_id, paid, paid_at").eq("round_id", roundId),
  ]);

  if (participantError || paymentError) {
    console.error("Erro ao buscar pagamentos:", participantError || paymentError);
    return [];
  }

  const playerIds = participants.map((participant) => participant.player_id);
  if (playerIds.length === 0) return [];

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("*")
    .in("id", playerIds)
    .order("name");

  if (playersError) {
    console.error("Erro ao buscar jogadores dos pagamentos:", playersError);
    return [];
  }

  const paymentByPlayer = new Map(payments.map((payment) => [payment.player_id, payment]));
  return (players as Player[]).map((player) => ({
    ...player,
    paid: paymentByPlayer.get(player.id)?.paid || false,
    paid_at: paymentByPlayer.get(player.id)?.paid_at || null,
  }));
}

export async function getPaymentAuditLog(): Promise<PaymentAuditLogEntry[]> {
  const client = await getAdminClient();
  if (!client) return [];

  const { data, error } = await client
    .from("round_payment_audit")
    .select(`
      id,
      round_id,
      target_player_id,
      target_player_name,
      paid,
      changed_by_player_id,
      changed_by_name,
      created_at,
      round:round_id (id, number, date, round_type)
    `)
    .order("id", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Erro ao buscar auditoria dos pagamentos:", error);
    return [];
  }

  return data as unknown as PaymentAuditLogEntry[];
}

export async function setPlayerPayment(roundId: string, playerId: string, paid: boolean) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Entre na sua conta para confirmar pagamentos." };
  const client = account.client;

  const { data: round } = await client
    .from("rounds")
    .select("status")
    .eq("id", roundId)
    .maybeSingle();

  if (round?.status !== "finished") {
    return { success: false, error: "Os pagamentos so podem ser marcados depois do fim da rodada." };
  }

  const { data: participant } = await client
    .from("round_players")
    .select("id")
    .eq("round_id", roundId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (!participant) return { success: false, error: "Este jogador nao participou da rodada." };

  const { error } = await client.from("round_payments").upsert({
    round_id: roundId,
    player_id: playerId,
    paid,
    paid_at: paid ? new Date().toISOString() : null,
  }, { onConflict: "round_id,player_id" });

  if (error) {
    console.error("Erro ao atualizar pagamento:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/pagamentos");
  revalidatePath("/admin/transfermarket");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateRoundPaymentDetails(roundId: string, paymentPix: string, paymentTotal: number) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem editar os dados do PIX." };

  const pix = paymentPix.trim();
  const total = Number(paymentTotal);
  if (!pix) return { success: false, error: "Informe a chave PIX." };
  if (!Number.isFinite(total) || total <= 0) return { success: false, error: "Informe um valor total valido." };

  const { data, error } = await client
    .from("rounds")
    .update({ payment_pix: pix, payment_total: Math.round(total * 100) / 100 })
    .eq("id", roundId)
    .eq("status", "finished")
    .select("id")
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Rodada finalizada nao encontrada." };

  revalidatePath("/pagamentos");
  revalidatePath("/admin/transfermarket");
  revalidatePath("/", "layout");
  return { success: true };
}
