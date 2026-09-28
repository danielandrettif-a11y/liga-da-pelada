"use server";

import { revalidatePath } from "next/cache";
import { supabase } from "../supabase";
import { getAdminClient, getCurrentAccount } from "../auth";
import type { Player, RoundStatus, RoundType } from "../types";
import { getActiveSeason } from "./seasons";
import { getActiveLeague } from "./rounds";
import { findLatestReleasedPaymentRound } from "../paymentStatus";

export type PaymentRound = {
  id: string;
  number: number;
  date: string;
  status: RoundStatus;
  round_type: RoundType;
  payment_pix: string | null;
  payment_total: number | null;
  payment_recipient_name: string | null;
  payment_extra_time_total: number;
  payment_extra_time_player_ids: string[];
  payment_ball_fund_total: number;
  payment_ball_fund_player_ids: string[];
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
    .select("id, number, date, status, round_type, payment_pix, payment_total, payment_recipient_name, payment_extra_time_total, payment_extra_time_player_ids, payment_ball_fund_total, payment_ball_fund_player_ids, created_at")
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
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return false;
  const { data: releasedRounds, error: roundError } = await supabase
    .from("rounds")
    .select("id")
    .eq("season_id", season.id)
    .eq("status", "finished")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (roundError) {
    console.error("Erro ao verificar rodada de pagamento:", roundError);
    return false;
  }
  return Boolean(releasedRounds?.length);
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

  if (paid) {
    // Só elimina coletivas antigas quando todos os participantes desta rodada
    // estiverem pagos; a RPC mantém esta última rodada como arquivo do ADM.
    await client.rpc("prune_collective_history_after_payment", { p_round_id: roundId });
  }

  revalidatePath("/pagamentos");
  revalidatePath("/coletiva");
  revalidatePath("/admin/transfermarket");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateRoundPaymentDetails(input: {
  roundId: string;
  paymentPix: string;
  paymentTotal: number;
  extraTimeTotal: number;
  extraTimePlayerIds: string[];
  ballFundTotal: number;
  ballFundPlayerIds: string[];
}) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem editar os dados do PIX." };

  const pix = input.paymentPix.trim();
  const total = Number(input.paymentTotal);
  const extraTimeTotal = Number(input.extraTimeTotal);
  const ballFundTotal = Number(input.ballFundTotal);
  if (!pix) return { success: false, error: "Informe a chave PIX." };
  if (pix.length > 200) return { success: false, error: "A chave PIX deve ter no máximo 200 caracteres." };
  if (!Number.isFinite(total) || total <= 0) return { success: false, error: "Informe um valor total valido." };
  if (!Number.isFinite(extraTimeTotal) || extraTimeTotal < 0 || !Number.isFinite(ballFundTotal) || ballFundTotal < 0) {
    return { success: false, error: "Informe valores extras válidos." };
  }

  const extraTimePlayerIds = extraTimeTotal > 0 ? [...new Set(input.extraTimePlayerIds.filter(Boolean))] : [];
  const ballFundPlayerIds = ballFundTotal > 0 ? [...new Set(input.ballFundPlayerIds.filter(Boolean))] : [];
  if (extraTimeTotal > 0 && !extraTimePlayerIds.length) return { success: false, error: "Selecione quem ficou no tempo extra." };
  if (ballFundTotal > 0 && !ballFundPlayerIds.length) return { success: false, error: "Selecione quem participa da caixinha da bola." };

  const { data, error } = await client.rpc("update_round_payment_details_v2", {
    p_round_id: input.roundId,
    p_payment_pix: pix,
    p_payment_total: total,
    p_extra_time_total: extraTimeTotal,
    p_extra_time_player_ids: extraTimePlayerIds,
    p_ball_fund_total: ballFundTotal,
    p_ball_fund_player_ids: ballFundPlayerIds,
  });

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Rodada finalizada nao encontrada." };

  revalidatePath("/pagamentos");
  revalidatePath("/coletiva");
  revalidatePath("/admin/transfermarket");
  revalidatePath("/", "layout");
  return {
    success: true,
    details: {
      pix,
      total: Math.round(total * 100) / 100,
      extraTimeTotal: Math.round(extraTimeTotal * 100) / 100,
      extraTimePlayerIds,
      ballFundTotal: Math.round(ballFundTotal * 100) / 100,
      ballFundPlayerIds,
    },
  };
}
