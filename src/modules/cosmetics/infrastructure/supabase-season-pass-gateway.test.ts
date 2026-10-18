import { describe, expect, it, vi } from "vitest";
import { supabaseSeasonPassMutationGateway } from "./supabase-season-pass-gateway";

function setup() {
  const reward = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "reward-1" }, error: null }),
  };
  const item = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "item-1" }, error: null }),
  };
  const db = {
    from: vi.fn((table: string) => table === "fantasy_season_pass_rewards" ? reward : item),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  };
  const gateway = supabaseSeasonPassMutationGateway(db as unknown as Parameters<typeof supabaseSeasonPassMutationGateway>[0]);
  return { gateway, reward, item, db };
}

describe("gateway Supabase do Passe", () => {
  it("restringe recompensa por temporada e item por temporada e usuário", async () => {
    const { gateway, reward, item } = setup();
    expect(await gateway.rewardBelongsToSeason("reward-1", "season-1")).toBe(true);
    expect(reward.eq).toHaveBeenCalledWith("id", "reward-1");
    expect(reward.eq).toHaveBeenCalledWith("fantasy_season_id", "season-1");
    expect(await gateway.shopItemBelongsToUserAndSeason("item-1", "season-1", "user-1")).toBe(true);
    expect(item.eq).toHaveBeenCalledWith("id", "item-1");
    expect(item.eq).toHaveBeenCalledWith("fantasy_season_id", "season-1");
    expect(item.eq).toHaveBeenCalledWith("user_id", "user-1");
    item.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await gateway.shopItemBelongsToUserAndSeason("missing", "season-1", "user-1")).toBe(false);
  });

  it("envia os mesmos parâmetros às RPCs e repassa suas mensagens", async () => {
    const { gateway, db } = setup();
    expect(await gateway.claim("reward-1", "cosmetic-1")).toBeNull();
    expect(await gateway.purchase("item-1")).toBeNull();
    expect(db.rpc).toHaveBeenNthCalledWith(1, "claim_fantasy_pass_cosmetic", {
      p_reward_id: "reward-1", p_cosmetic_id: "cosmetic-1",
    });
    expect(db.rpc).toHaveBeenNthCalledWith(2, "purchase_fantasy_pass_shop_item", { p_shop_item_id: "item-1" });
    db.rpc.mockResolvedValueOnce({ error: { message: "Pontos extras insuficientes" } });
    expect(await gateway.purchase("item-1")).toBe("Pontos extras insuficientes");
  });
});
