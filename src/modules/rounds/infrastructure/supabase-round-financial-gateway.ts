import type { SupabaseClient } from "@supabase/supabase-js";

type FinalizeRoundFinancialsInput = {
  roundId: string;
  leagueId: string;
  paymentPix: string;
  paymentTotal: number;
  recipientId: string | null;
  recipientName: string | null;
  expenseItemIds: string[];
};

export async function finalizeRoundFinancials(
  client: SupabaseClient,
  input: FinalizeRoundFinancialsInput,
) {
  return client.rpc("finalize_round_financials", {
    p_round_id: input.roundId,
    p_league_id: input.leagueId,
    p_payment_pix: input.paymentPix,
    p_payment_total: Math.round(input.paymentTotal * 100) / 100,
    p_recipient_id: input.recipientId,
    p_recipient_name: input.recipientName,
    p_expense_item_ids: [...new Set(input.expenseItemIds)],
  });
}

export async function restoreRoundFinancials(
  client: SupabaseClient,
  input: { roundId: string; leagueId: string; originalState: unknown },
) {
  return client.rpc("restore_round_financials", {
    p_round_id: input.roundId,
    p_league_id: input.leagueId,
    p_original_state: input.originalState,
  });
}
