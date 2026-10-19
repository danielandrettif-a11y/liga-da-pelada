import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentCommandGateway } from "../application/payment-commands";

export function supabasePaymentCommandGateway(client: SupabaseClient): PaymentCommandGateway {
  return {
    async recipientIsActive(recipientId, leagueId) {
      const { data } = await client.from("payment_recipients").select("id")
        .eq("id", recipientId).eq("league_id", leagueId).eq("is_active", true).maybeSingle();
      return Boolean(data);
    },
    async createExpenseItem(input) {
      const { error } = await client.from("league_expense_items").insert({
        league_id: input.leagueId,
        name: input.name,
        description: input.description,
        total_amount: input.totalAmount,
        installment_count: input.installmentCount,
        recipient_id: input.recipientId,
        created_by: input.userId,
      });
      return error?.message || null;
    },
    async setExpenseItemStatus(id, leagueId, status) {
      const { error } = await client.from("league_expense_items")
        .update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("league_id", leagueId);
      return error?.message || null;
    },
    async getExpenseInstallmentState(id, leagueId) {
      const [{ data: item }, { count, error: countError }] = await Promise.all([
        client.from("league_expense_items").select("id, installment_count")
          .eq("id", id).eq("league_id", leagueId).maybeSingle(),
        client.from("round_expense_installments").select("id", { count: "exact", head: true })
          .eq("expense_item_id", id).eq("status", "active"),
      ]);
      if (!item || countError) return null;
      return { installmentCount: Number(item.installment_count), registeredCount: Number(count || 0) };
    },
    async setPaidInstallmentsBeforeApp(id, leagueId, value) {
      const { error } = await client.from("league_expense_items")
        .update({ paid_installments_before_app: value, updated_at: new Date().toISOString() })
        .eq("id", id).eq("league_id", leagueId);
      return error?.message || null;
    },
    async getRoundStatus(roundId, leagueId) {
      const { data } = await client.from("rounds").select("status")
        .eq("id", roundId).eq("league_id", leagueId).maybeSingle();
      return data?.status || null;
    },
    async syncRoundPlan(roundId, expenseItemIds) {
      const { error } = await client.rpc("sync_round_payment_plan", {
        p_round_id: roundId,
        p_expense_item_ids: expenseItemIds,
      });
      return error?.message || null;
    },
    async setObligationPaid(id, amountPaid) {
      const { error } = await client.rpc("set_round_payment_obligation_paid", {
        p_obligation_id: id,
        p_amount_paid: amountPaid,
      });
      return error?.message || null;
    },
    async saveRecipient(input) {
      const payload = {
        league_id: input.leagueId,
        name: input.name,
        pix_key: input.pixKey,
        pix_type: input.pixType,
        is_active: input.active,
        created_by: input.userId,
      };
      const result = input.id
        ? await client.from("payment_recipients").update(payload).eq("id", input.id).eq("league_id", input.leagueId)
        : await client.from("payment_recipients").insert(payload);
      return result.error?.message || null;
    },
    async setRecipientActive(id, leagueId, active) {
      const { error } = await client.from("payment_recipients")
        .update({ is_active: active }).eq("id", id).eq("league_id", leagueId);
      return error?.message || null;
    },
    async participantExists(roundId, playerId) {
      const { data } = await client.from("round_players").select("id")
        .eq("round_id", roundId).eq("player_id", playerId).maybeSingle();
      return Boolean(data);
    },
    async upsertPlayerPayment(roundId, playerId, paid) {
      const { error } = await client.from("round_payments").upsert({
        round_id: roundId,
        player_id: playerId,
        paid,
        paid_at: paid ? new Date().toISOString() : null,
      }, { onConflict: "round_id,player_id" });
      return error?.message || null;
    },
    async pruneCollectiveHistory(roundId) {
      await client.rpc("prune_collective_history_after_payment", { p_round_id: roundId });
    },
    async updateRoundPaymentDetails(input) {
      const { data, error } = await client.rpc("update_round_payment_details_v2", {
        p_round_id: input.roundId,
        p_payment_pix: input.pix,
        p_payment_total: input.total,
        p_extra_time_total: input.extraTimeTotal,
        p_extra_time_player_ids: input.extraTimePlayerIds,
        p_ball_fund_total: input.ballFundTotal,
        p_ball_fund_player_ids: input.ballFundPlayerIds,
      });
      return { found: Boolean(data), error: error?.message || null };
    },
    async listActiveRoundExpenseItemIds(roundId) {
      const { data } = await client.from("round_expense_installments")
        .select("expense_item_id").eq("round_id", roundId).eq("status", "active");
      return [...new Set((data || []).map((item) => item.expense_item_id))];
    },
  };
}
