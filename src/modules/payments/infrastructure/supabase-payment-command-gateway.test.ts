import { describe, expect, it, vi } from "vitest";
import { supabasePaymentCommandGateway } from "./supabase-payment-command-gateway";

function query(result: { data?: unknown; error?: unknown; count?: number | null } = {}) {
  const value: any = {
    select: vi.fn(() => value), eq: vi.fn(() => value), update: vi.fn(() => value), insert: vi.fn().mockResolvedValue(result),
    upsert: vi.fn().mockResolvedValue(result), maybeSingle: vi.fn().mockResolvedValue(result),
  };
  value.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return value;
}

describe("supabasePaymentCommandGateway", () => {
  it("consulta destinatário ativo dentro da pelada", async () => {
    const recipient = query({ data: { id: "pix-a" }, error: null });
    const gateway = supabasePaymentCommandGateway({ from: vi.fn(() => recipient), rpc: vi.fn() } as any);
    expect(await gateway.recipientIsActive("pix-a", "league-a")).toBe(true);
    expect(recipient.eq).toHaveBeenCalledWith("id", "pix-a");
    expect(recipient.eq).toHaveBeenCalledWith("league_id", "league-a");
    expect(recipient.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("envia o plano e os detalhes da rodada pelas RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const gateway = supabasePaymentCommandGateway({ from: vi.fn(), rpc } as any);
    await gateway.syncRoundPlan("round-a", ["item-a"]);
    await gateway.updateRoundPaymentDetails({
      roundId: "round-a", pix: "pix", total: 120, extraTimeTotal: 10,
      extraTimePlayerIds: ["p1"], ballFundTotal: 5, ballFundPlayerIds: ["p2"],
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "sync_round_payment_plan", { p_round_id: "round-a", p_expense_item_ids: ["item-a"] });
    expect(rpc).toHaveBeenNthCalledWith(2, "update_round_payment_details_v2", {
      p_round_id: "round-a", p_payment_pix: "pix", p_payment_total: 120,
      p_extra_time_total: 10, p_extra_time_player_ids: ["p1"],
      p_ball_fund_total: 5, p_ball_fund_player_ids: ["p2"],
    });
  });
});
