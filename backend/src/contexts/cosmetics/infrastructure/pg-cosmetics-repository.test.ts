import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PgCosmeticsRepository } from "./pg-cosmetics-repository.js";

function database(handler: (sql: string, values?: unknown[]) => { rows: any[]; rowCount?: number } | Promise<{ rows: any[]; rowCount?: number }>) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (["BEGIN", "COMMIT", "ROLLBACK", "SET LOCAL ROLE authenticated"].includes(sql)
      || sql.includes("set_config('request.jwt.claim.sub'")) return { rows: [], rowCount: 0 };
    return handler(sql, values);
  });
  const release = vi.fn();
  return { pool: { connect: vi.fn().mockResolvedValue({ query, release }) } as unknown as Pool, query, release };
}

const item = { id: "c1", slug: "gold", slot: "frame", rarity: "legendary", name: "Dourada", description: "", asset_key: "frame-gold" };

describe("PgCosmeticsRepository", () => {
  it("builds the dashboard from the canonical global inventory and account loadout", async () => {
    const db = database(async (sql) => {
      if (sql.includes("is_app_admin")) return { rows: [{ allowed: false }], rowCount: 1 };
      if (sql.includes("FROM public.fantasy_seasons WHERE")) return { rows: [{ id: "fs1" }], rowCount: 1 };
      if (sql.includes("FROM public.fantasy_user_cosmetics owned")) return { rows: [{ cosmetic_id: "c1", source_reward_id: "r1", cosmetic: item }] };
      if (sql === "SELECT * FROM public.fantasy_cosmetics ORDER BY created_at") return { rows: [item] };
      if (sql.includes("FROM public.fantasy_season_pass_rewards reward")) return { rows: [] };
      if (sql.includes("FROM public.fantasy_user_cosmetic_reward_choices")) return { rows: [] };
      if (sql.includes("FROM public.account_cosmetic_loadouts")) return { rows: [{ frame_cosmetic_id: "c1" }] };
      if (sql.includes("FROM public.fantasy_season_passes")) return { rows: [{ progress: 40, total_progress_points: 44, shop_bonus_points: 2 }] };
      if (sql.includes("FROM public.fantasy_season_pass_shop_items shop")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const dashboard = await new PgCosmeticsRepository(db.pool).getCosmeticsDashboard({ userId: "u1", leagueId: "l1", seasonId: "s1" });
    expect(dashboard.cosmetics).toEqual([{ id: "c1", slug: "gold", slot: "frame", rarity: "legendary", name: "Dourada", description: "", assetKey: "frame-gold" }]);
    expect(dashboard.equipped.frame).toBe("c1");
    expect(dashboard.previewCatalog).toEqual([]);
    expect(dashboard.shop.balancePoints).toBe(6);
    expect(db.release).toHaveBeenCalledWith(false);
  });

  it("uses the authenticated RPC and preserves its business failure", async () => {
    const db = database(async (sql) => {
      if (sql.includes("equip_account_cosmetic")) throw new Error("Cosmetico nao pertence a conta ou ao slot");
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const result = await new PgCosmeticsRepository(db.pool).equipCosmetic({ userId: "u1", slot: "frame", cosmeticId: "c1" });
    expect(result).toEqual({ success: false, error: "Cosmetico nao pertence a conta ou ao slot" });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("equip_account_cosmetic"), ["frame", "c1"]);
  });

  it("derives admin preview permission from PostgreSQL and ignores spoofable client state", async () => {
    const denied = database(async (sql) => {
      if (sql.includes("public.is_app_admin()")) return { rows: [], rowCount: 0 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const result = await new PgCosmeticsRepository(denied.pool).resolveAdminCosmeticsPreview({
      userId: "u1", playerId: "p1", requested: { frame: "c1" },
    });
    expect(result).toBeNull();
    expect(denied.query).not.toHaveBeenCalledWith(expect.stringContaining("FROM public.fantasy_cosmetics WHERE"), expect.anything());
  });

  it("executes scoped maintenance RPCs instead of silent no-ops", async () => {
    const db = database(async (sql, values) => {
      if (sql.includes("cleanup_my_cosmetics_preview")) return { rows: [{ count: 3 }], rowCount: 1 };
      if (sql.includes("dismiss_my_unopened_bronze_pass_pack")) return { rows: [{ count: 2 }], rowCount: 1 };
      if (sql.includes("reset_my_test_pass_cosmetic_claims")) return { rows: [{ count: 4 }], rowCount: 1 };
      throw new Error(`Unexpected SQL ${sql} ${values}`);
    });
    const repo = new PgCosmeticsRepository(db.pool);
    expect(await repo.cleanupLegacyCosmeticsPreview("u1", "fs1")).toEqual({ success: true, removed: 3 });
    expect(await repo.dismissUnopenedBronzePassPack("u1", "fs1")).toEqual({ success: true, dismissed: 2 });
    expect(await repo.resetTestPassRewardClaims({ userId: "u1", fantasySeasonId: "fs1", selectedFantasySeasonId: "fs1" })).toEqual({ success: true, removed: 4 });
    expect(await repo.resetTestPassRewardClaims({ userId: "u1", fantasySeasonId: "fs1", selectedFantasySeasonId: "other" })).toEqual({ success: false, error: "Passe não pertence à pelada selecionada." });
  });
});
