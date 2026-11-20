import { describe, it, expect, vi } from "vitest";
import { PgCosmeticsRepository } from "./pg-cosmetics-repository.js";

describe("PgCosmeticsRepository", () => {
  it("loads cosmetics dashboard", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("public.is_league_member")) return { rows: [{ member: true, admin: true }] };
      if (sql.includes("SELECT id FROM public.fantasy_seasons")) return { rows: [{ id: "fs1" }] };
      if (sql.includes("FROM public.fantasy_user_cosmetics")) return { rows: [{ cosmetic_id: "c1" }] };
      if (sql.includes("SELECT * FROM public.fantasy_cosmetics")) return { rows: [{ id: "c1", slot: "frame" }] };
      return { rows: [] };
    });
    const mockPool: any = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) };

    const repo = new PgCosmeticsRepository(mockPool);
    const dashboard = await repo.getCosmeticsDashboard({
      userId: "u1",
      leagueId: "l1",
      seasonId: "s1",
    });

    expect(dashboard.catalog).toHaveLength(1);
    expect(dashboard.owned[0].cosmetic_id).toBe("c1");
    expect(dashboard.isAdmin).toBe(true);
    expect(dashboard.fantasySeasonId).toBe("fs1");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("set_config('request.jwt.claim.sub'"), expect.arrayContaining(["u1"]));
  });

  it("equips through the authenticated database operation", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("equip_account_cosmetic") ? { rows: [{ applied: true }] } : { rows: [] });
    const mockPool: any = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) };

    const repo = new PgCosmeticsRepository(mockPool);
    const res = await repo.equipCosmetic({
      userId: "u1",
      slot: "frame",
      cosmeticId: "c1",
    });

    expect(res.success).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("set_config('request.jwt.claim.sub'"), expect.arrayContaining(["u1"]));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("equip_account_cosmetic"), ["frame", "c1"]);
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("rolls back and reports failure when a cosmetic mutation fails", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("equip_account_cosmetic")) throw new Error("Você não possui este cosmético.");
      return { rows: [] };
    });
    const repo = new PgCosmeticsRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    expect(await repo.equipCosmetic({ userId: "u1", slot: "frame", cosmeticId: "c1" })).toEqual({ success: false, error: "Você não possui este cosmético." });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
  });

  it("rejects a reward outside the authenticated member's season", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const repo = new PgCosmeticsRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    const result = await repo.claimPassCosmetic({ userId: "u1", rewardId: "reward", cosmeticId: "c1", fantasySeasonId: "season" });
    expect(result.success).toBe(false);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("claim_fantasy_pass_cosmetic"), expect.anything());
  });

  it("rolls back a purchase if the database rejects it", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT 1 FROM public.fantasy_season_pass_shop_items")) return { rows: [{}], rowCount: 1 };
      if (sql.includes("purchase_fantasy_pass_shop_item")) throw new Error("Pontos extras insuficientes");
      return { rows: [] };
    });
    const repo = new PgCosmeticsRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    expect(await repo.purchaseSeasonPassShopItem({ userId: "u1", shopItemId: "item", fantasySeasonId: "season" })).toEqual({ success: false, error: "Pontos extras insuficientes" });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
  });

  it("checks league admin and own player before returning catalog preview", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.account_profiles")) return { rows: [{}], rowCount: 1 };
      if (sql.includes("FROM public.fantasy_cosmetics")) return { rows: [{ id: "c1", name: "Frame", asset_key: "gold", slot: "frame" }] };
      return { rows: [] };
    });
    const repo = new PgCosmeticsRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    const preview = await repo.resolveAdminCosmeticsPreview({ userId: "u1", leagueId: "l1", playerId: "p1", requested: { frame: "c1", aura: "c1" } });
    expect(preview).toMatchObject({ frameKey: "gold", auraKey: null });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("public.is_league_admin"), ["u1", "p1", "l1"]);
  });

  it("reads player cosmetics under the authenticated viewer and maps by player id", async () => {
    const summary = { frameKey: "gold", auraKey: null, titleName: null, bannerAssetKey: null, nameplateKey: null, backgroundAssetKey: null, showcaseAssetKey: null, pitchAssetKey: null };
    const query = vi.fn(async (sql: string) => sql.includes("FROM public.account_cosmetic_loadouts") ? { rows: [{ player_id: "p1", summary }] } : { rows: [] });
    const connect = vi.fn().mockResolvedValue({ query, release: vi.fn() });
    const repo = new PgCosmeticsRepository({ connect } as any);
    expect(await repo.getAllPlayersEquippedCosmeticsMap("u1", ["p1"])).toEqual({ p1: summary });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("set_config('request.jwt.claim.sub'"), expect.arrayContaining(["u1"]));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM public.account_cosmetic_loadouts"), [false, "u1", ["p1"]]);
    expect(await repo.getAllPlayersEquippedCosmeticsMap("u1", [])).toEqual({});
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("does not query preview catalog for an unauthorized user", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const repo = new PgCosmeticsRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    expect(await repo.resolveAdminCosmeticsPreview({ userId: "u1", leagueId: "l1", playerId: "p2", requested: { frame: "c1" } })).toBeNull();
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("FROM public.fantasy_cosmetics"), expect.anything());
  });

  it("runs scoped cleanup with the actor identity and returns the affected count", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("public.cleanup_my_cosmetics_preview") ? { rows: [{ count: 3 }] } : { rows: [] });
    const repo = new PgCosmeticsRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    expect(await repo.cleanupLegacyCosmeticsPreview("u1", "fs1")).toEqual({ success: true, removed: 3 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("set_config('request.jwt.claim.sub'"), expect.arrayContaining(["u1"]));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("public.cleanup_my_cosmetics_preview"), ["fs1"]);
  });

  it("refuses a different selected season and rolls back database authorization errors", async () => {
    const query = vi.fn(async (sql: string) => { if (sql.includes("dismiss_my_unopened_bronze_pass_pack")) throw new Error("Somente ADM"); return { rows: [] }; });
    const repo = new PgCosmeticsRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    expect((await repo.resetTestPassRewardClaims({ userId: "u1", fantasySeasonId: "fs1", selectedFantasySeasonId: "fs2" })).success).toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(await repo.dismissUnopenedBronzePassPack("u1", "fs1")).toEqual({ success: false, error: "Somente ADM" });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });
});
