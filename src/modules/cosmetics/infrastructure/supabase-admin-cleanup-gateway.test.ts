import { describe, expect, it, vi } from "vitest";
import { readFantasySeasonId, supabaseAdminCosmeticsCleanupGateway } from "./supabase-admin-cleanup-gateway";

function setup() {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "fantasy-a" }, error: null }),
  };
  const db = {
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockResolvedValue({ data: 2, error: null }),
  };
  const client = db as unknown as Parameters<typeof readFantasySeasonId>[0];
  return { client, db, query };
}

describe("gateway Supabase da limpeza do Passe", () => {
  it("resolve a temporada do Cartola com filtros de temporada e pelada", async () => {
    const { client, db, query } = setup();
    expect(await readFantasySeasonId(client, "league-a", "season-a")).toBe("fantasy-a");
    expect(db.from).toHaveBeenCalledWith("fantasy_seasons");
    expect(query.select).toHaveBeenCalledWith("id");
    expect(query.eq).toHaveBeenCalledWith("season_id", "season-a");
    expect(query.eq).toHaveBeenCalledWith("league_id", "league-a");
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await readFantasySeasonId(client, "league-a", "season-a")).toBeNull();
  });

  it("envia o ID explícito à RPC correta em cada operação", async () => {
    const { client, db } = setup();
    const gateway = supabaseAdminCosmeticsCleanupGateway(client);
    expect(await gateway.cleanupPreview("fantasy-a")).toEqual({ count: 2, error: null });
    expect(await gateway.dismissBronzePack("fantasy-a")).toEqual({ count: 2, error: null });
    expect(await gateway.resetTestClaims("fantasy-a")).toEqual({ count: 2, error: null });
    expect(db.rpc.mock.calls).toEqual([
      ["cleanup_my_cosmetics_preview", { p_fantasy_season_id: "fantasy-a" }],
      ["dismiss_my_unopened_bronze_pass_pack", { p_fantasy_season_id: "fantasy-a" }],
      ["reset_my_test_pass_cosmetic_claims", { p_fantasy_season_id: "fantasy-a" }],
    ]);
  });

  it("normaliza contagem nula e repassa erro da RPC", async () => {
    const { client, db } = setup();
    db.rpc.mockResolvedValueOnce({ data: null, error: null });
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: "negado" } });
    const gateway = supabaseAdminCosmeticsCleanupGateway(client);
    expect(await gateway.cleanupPreview("fantasy-a")).toEqual({ count: 0, error: null });
    expect(await gateway.dismissBronzePack("fantasy-a")).toEqual({ count: 0, error: "negado" });
  });
});
