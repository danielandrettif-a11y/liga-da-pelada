import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExpenseItem,
  PaymentAuditLogEntry,
  PaymentChargeLine,
  PaymentObligation,
  PaymentPlayer,
  PaymentRecipient,
  PaymentRound,
  RoundExpenseSelection,
} from "../domain/payment";

async function roundExists(client: SupabaseClient, roundId: string, leagueId: string) {
  const { data } = await client.from("rounds").select("id")
    .eq("id", roundId).eq("league_id", leagueId).maybeSingle();
  return Boolean(data);
}

export async function readExpenseItems(client: SupabaseClient, leagueId: string, includeArchived = false): Promise<ExpenseItem[]> {
  let query = client.from("league_expense_items")
    .select("id, name, description, total_amount, installment_count, status, recipient_id, created_at, paid_installments_before_app, recipient:payment_recipients!league_expense_items_recipient_id_fkey(name,pix_key), installments:round_expense_installments(id,status)")
    .eq("league_id", leagueId).order("created_at", { ascending: false });
  if (!includeArchived) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) return [];
  return (data || []).map((raw) => {
    const row = raw as unknown as Record<string, any>;
    const paidBefore = Number(row.paid_installments_before_app || 0);
    return {
      ...row,
      total_amount: Number(row.total_amount),
      paid_installments_before_app: paidBefore,
      recipient: Array.isArray(row.recipient) ? row.recipient[0] || null : row.recipient,
      paid_installments: paidBefore + (row.installments || []).filter((item: any) => item.status === "active").length,
    } as ExpenseItem;
  });
}

export async function readRoundExpenseSelections(client: SupabaseClient, leagueId: string, roundId: string): Promise<RoundExpenseSelection[]> {
  if (!await roundExists(client, roundId, leagueId)) return [];
  const { data } = await client.from("round_expense_installments")
    .select("expense_item_id, installment_number").eq("round_id", roundId).eq("status", "active");
  return (data || []).map((item) => ({ expense_item_id: item.expense_item_id, installment_number: Number(item.installment_number) }));
}

export async function readRoundPaymentChargeLines(client: SupabaseClient, leagueId: string, roundId: string): Promise<PaymentChargeLine[]> {
  if (!await roundExists(client, roundId, leagueId)) return [];
  const { data } = await client.from("round_payment_charge_lines")
    .select("id,player_id,recipient_name,recipient_pix,label,amount,charge_type").eq("round_id", roundId).order("id");
  return (data || []).map((line) => ({ ...line, amount: Number(line.amount) })) as PaymentChargeLine[];
}

export async function readRoundPaymentObligations(client: SupabaseClient, leagueId: string, roundId: string): Promise<PaymentObligation[]> {
  if (!await roundExists(client, roundId, leagueId)) return [];
  const { data } = await client.from("round_payment_obligations")
    .select("id,round_id,player_id,recipient_name,recipient_pix,amount_due,amount_paid,status")
    .eq("round_id", roundId).order("recipient_name");
  return (data || []).map((row) => ({ ...row, amount_due: Number(row.amount_due), amount_paid: Number(row.amount_paid) })) as PaymentObligation[];
}

export async function readPaymentRecipients(client: SupabaseClient, leagueId: string, includeInactive = false): Promise<PaymentRecipient[]> {
  let query = client.from("payment_recipients").select("id, name, pix_key, pix_type, is_active")
    .eq("league_id", leagueId).order("name");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query;
  return (data || []) as PaymentRecipient[];
}

export async function readPaymentRounds(client: SupabaseClient, seasonId: string): Promise<PaymentRound[]> {
  const { data, error } = await client.from("rounds")
    .select("id, number, date, status, round_type, payment_pix, payment_total, payment_recipient_name, payment_extra_time_total, payment_extra_time_player_ids, payment_ball_fund_total, payment_ball_fund_player_ids, created_at")
    .eq("season_id", seasonId).order("date", { ascending: false }).order("created_at", { ascending: false });
  if (error) {
    console.error("Erro ao buscar rodadas para pagamento:", error);
    return [];
  }
  return data as PaymentRound[];
}

export async function readLatestFinishedRoundPaymentState(client: SupabaseClient, seasonId: string) {
  const { data: rounds, error } = await client.from("rounds").select("id")
    .eq("season_id", seasonId).eq("status", "finished")
    .order("date", { ascending: false }).order("created_at", { ascending: false }).limit(1);
  if (error || !rounds?.[0]) return error ? { error, participants: [], payments: [] } : null;
  const roundId = rounds[0].id;
  const [participants, payments] = await Promise.all([
    client.from("round_players").select("player_id").eq("round_id", roundId),
    client.from("round_payments").select("player_id, paid").eq("round_id", roundId),
  ]);
  if (participants.error || payments.error) return { error: participants.error || payments.error, participants: [], payments: [] };
  return { error: null, participants: participants.data || [], payments: payments.data || [] };
}

export async function readRoundPaymentPlayers(client: SupabaseClient, leagueId: string, roundId: string): Promise<PaymentPlayer[]> {
  if (!await roundExists(client, roundId, leagueId)) return [];
  const [participants, payments] = await Promise.all([
    client.from("round_players").select("player_id").eq("round_id", roundId),
    client.from("round_payments").select("player_id, paid, paid_at").eq("round_id", roundId),
  ]);
  if (participants.error || payments.error) {
    console.error("Erro ao buscar pagamentos:", participants.error || payments.error);
    return [];
  }
  const playerIds = (participants.data || []).map((item) => item.player_id);
  if (!playerIds.length) return [];
  const { data: players, error } = await client.from("players").select("*").in("id", playerIds).order("name");
  if (error) {
    console.error("Erro ao buscar jogadores dos pagamentos:", error);
    return [];
  }
  const paymentByPlayer = new Map((payments.data || []).map((payment) => [payment.player_id, payment]));
  return (players || []).map((player) => ({
    ...player,
    paid: paymentByPlayer.get(player.id)?.paid || false,
    paid_at: paymentByPlayer.get(player.id)?.paid_at || null,
  })) as PaymentPlayer[];
}

export async function readPaymentAuditLog(client: SupabaseClient, leagueId: string): Promise<PaymentAuditLogEntry[]> {
  const { data: rounds, error: roundsError } = await client.from("rounds").select("id").eq("league_id", leagueId);
  if (roundsError || !rounds?.length) return [];
  const { data, error } = await client.from("round_payment_audit").select(`
    id, round_id, target_player_id, target_player_name, paid,
    changed_by_player_id, changed_by_name, created_at,
    round:round_id (id, number, date, round_type)
  `).in("round_id", rounds.map((round) => round.id)).order("id", { ascending: false }).limit(1000);
  if (error) {
    console.error("Erro ao buscar auditoria dos pagamentos:", error);
    return [];
  }
  return data as unknown as PaymentAuditLogEntry[];
}
