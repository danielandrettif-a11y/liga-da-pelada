import { describe, expect, it, vi } from "vitest";
import { readCosmeticsDashboardRows } from "./supabase-dashboard-reader";

function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
}

function setup() {
  const queries = {
    fantasy_seasons: query({ id: "fantasy-season-a" }),
    fantasy_user_cosmetics: query([{ cosmetic_id: "cosmetic-1", source_reward_id: null, cosmetic: { id: "cosmetic-1" } }]),
    fantasy_cosmetics: query([{ id: "cosmetic-1" }]),
    fantasy_season_pass_rewards: query([{ id: "reward-1" }]),
    fantasy_user_cosmetic_reward_choices: query([{ reward_id: "reward-1", cosmetic_id: "cosmetic-1" }]),
    account_cosmetic_loadouts: query({ frame_cosmetic_id: "cosmetic-1" }),
    fantasy_season_passes: query({ progress: 40 }),
    fantasy_season_pass_shop_items: query([{ id: "shop-1" }]),
  };
  const db = { from: vi.fn((table: string) => queries[table as keyof typeof queries]) };
  const client = db as unknown as Parameters<typeof readCosmeticsDashboardRows>[0];
  return { queries, db, client };
}

const input = { userId: "user-a", leagueId: "league-a", seasonId: "season-a", isAdmin: false };

describe("leitura Supabase do painel de cosméticos", () => {
  it("filtra a temporada pela pelada e os dados privados pela conta", async () => {
    const { client, queries } = setup();
    const rows = await readCosmeticsDashboardRows(client, input);

    expect(queries.fantasy_seasons.eq).toHaveBeenCalledWith("season_id", "season-a");
    expect(queries.fantasy_seasons.eq).toHaveBeenCalledWith("league_id", "league-a");
    expect(queries.fantasy_user_cosmetics.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(queries.account_cosmetic_loadouts.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(queries.fantasy_season_pass_rewards.eq).toHaveBeenCalledWith("fantasy_season_id", "fantasy-season-a");
    expect(queries.fantasy_user_cosmetic_reward_choices.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(queries.fantasy_season_passes.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(queries.fantasy_season_passes.eq).toHaveBeenCalledWith("fantasy_season_id", "fantasy-season-a");
    expect(queries.fantasy_season_pass_shop_items.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(queries.fantasy_season_pass_shop_items.eq).toHaveBeenCalledWith("fantasy_season_id", "fantasy-season-a");
    expect(rows).toMatchObject({ fantasySeasonId: "fantasy-season-a", isAdmin: false });
    expect(rows?.owned).toHaveLength(1);
    expect(rows?.shop).toHaveLength(1);
  });

  it("mantém coleção e equipamento globais quando a pelada não tem temporada do Passe", async () => {
    const { client, db } = setup();
    const rows = await readCosmeticsDashboardRows(client, { ...input, seasonId: null, isAdmin: true });

    expect(rows).toMatchObject({
      fantasySeasonId: null, isAdmin: true, rewards: [], choices: [], pass: null, shop: [],
      loadout: { frame_cosmetic_id: "cosmetic-1" },
    });
    expect(rows?.owned).toHaveLength(1);
    expect(db.from.mock.calls.map(([table]) => table)).toEqual([
      "fantasy_user_cosmetics", "fantasy_cosmetics", "account_cosmetic_loadouts",
    ]);
  });

  it("também ignora leituras do Passe se não houver fantasy season correspondente", async () => {
    const { client, db, queries } = setup();
    queries.fantasy_seasons.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const rows = await readCosmeticsDashboardRows(client, input);
    expect(rows?.fantasySeasonId).toBeNull();
    expect(rows?.rewards).toEqual([]);
    expect(db.from).not.toHaveBeenCalledWith("fantasy_season_pass_rewards");
  });

  it.each(["fantasy_user_cosmetics", "fantasy_cosmetics", "fantasy_season_pass_rewards"] as const)(
    "retorna indisponível quando a leitura obrigatória %s falha", async (table) => {
      const { client, queries } = setup();
      Object.assign(queries[table], query(null, { message: "sem permissão" }));
      expect(await readCosmeticsDashboardRows(client, input)).toBeNull();
    },
  );

  it("não oculta coleção/recompensas quando loja ou Passe opcional falham", async () => {
    const { client, queries } = setup();
    Object.assign(queries.fantasy_season_passes, query(null, { message: "Passe indisponível" }));
    Object.assign(queries.fantasy_season_pass_shop_items, query(null, { message: "Loja indisponível" }));
    const rows = await readCosmeticsDashboardRows(client, input);
    expect(rows?.owned).toHaveLength(1);
    expect(rows?.rewards).toHaveLength(1);
    expect(rows?.pass).toBeNull();
    expect(rows?.shop).toEqual([]);
  });
});
