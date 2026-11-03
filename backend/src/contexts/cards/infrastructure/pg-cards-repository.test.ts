import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { PgCardsRepository } from "./pg-cards-repository.js";

function createMockPool(handler: (sql: string, params?: any[]) => Promise<any>) {
  const query = vi.fn().mockImplementation((sql: string, params?: any[]) => {
    if (["BEGIN", "COMMIT", "ROLLBACK", "SET LOCAL ROLE"].includes(sql)
      || sql.includes("set_config('request.jwt.claim.sub'")) return Promise.resolve({ rows: [], rowCount: 0 });
    return handler(sql, params);
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  return { pool: { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool, query };
}

function packRow(id: string, status: string, offers: any[] = []) {
  return { id, round_id: "r1", round_number: 1, status, opened_at: null, chosen_card_id: null,
    created_at: "2026-11-03", source: "round_reward", card_tier: "bronze", offers };
}

const card = (id: string, slug: string) => ({
  id, slug, name: slug, description: "", rarity: "COMMON", effect_type: "NONE", effect_config: {}, enabled: true,
});

describe("Infrastructure: PgCardsRepository", () => {
  it("retrieves scoped real packs and separates available from claimed", async () => {
    const { pool } = createMockPool(async (sql, params) => {
      if (sql.includes("SELECT pack.id FROM public.fantasy_round_packs")) return { rows: [{ id: "p1" }, { id: "p2" }] };
      if (sql.includes("SELECT pack.id, pack.round_id")) return { rows: [packRow(params?.[0], params?.[0] === "p1" ? "available" : "claimed")] };
      return { rows: [], rowCount: 0 };
    });
    const result = await new PgCardsRepository(pool).getMyPacks("l1", "u1");
    expect(result).toMatchObject({ totalPacks: 2, claimedCount: 1 });
    expect(result.availablePacks).toHaveLength(1);
  });

  it("opens a pack idempotently and persists two catalog offers", async () => {
    let opened = false;
    const { pool, query } = createMockPool(async (sql) => {
      if (sql.startsWith("SELECT pack.id FROM")) return { rows: [{ id: "p1" }], rowCount: 1 };
      if (sql.includes("SELECT pack.id, pack.round_id")) return { rows: [packRow("p1", opened ? "opened" : "available",
        opened ? [{ slot: 1, card: card("c1", "one") }, { slot: 2, card: card("c2", "two") }] : [])] };
      if (sql.includes("FROM public.fantasy_cards WHERE enabled")) return { rows: [card("c1", "one"), card("c2", "two")] };
      if (sql.includes("UPDATE public.fantasy_round_packs SET status='opened'")) opened = true;
      return { rows: [], rowCount: 1 };
    });
    const result = await new PgCardsRepository(pool).openPack("l1", "u1", "p1");
    expect(result.success).toBe(true);
    expect(result.offers).toHaveLength(2);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("fantasy_pack_offers"), expect.any(Array));
  });

  it("activates an owned card using the real inventory and activation tables", async () => {
    const { pool, query } = createMockPool(async (sql) => {
      if (sql.includes("SELECT 1 FROM public.rounds round_item")) return { rows: [{ exists: 1 }], rowCount: 1 };
      if (sql.includes("FROM public.fantasy_user_cards owned JOIN")) {
        return { rows: [{ id: "uc1", card_id: "c1", status: "OWNED", slug: "golden_goal",
          name: "Gol de Ouro", rarity: "COMMON", effect_type: "CONDITIONAL_PLAYER_BONUS",
          effect_config: { bonus: 3 } }], rowCount: 1 };
      }
      if (sql.includes("FROM public.fantasy_card_activations WHERE")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM public.league_members member")) return { rows: [{ id: "p1" }], rowCount: 1 };
      if (sql.includes("FROM public.fantasy_lineup_players item")) return { rows: [{ id: "p1" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const result = await new PgCardsRepository(pool).activateCardForRound({
      leagueId: "l1", userId: "u1", roundId: "r1", userCardId: "uc1", targetPlayerId: "p1",
    });
    expect(result.success).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("fantasy_card_activations"), expect.any(Array));
    const insert = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO public.fantasy_card_activations"));
    expect(JSON.parse(insert?.[1]?.[4])).toMatchObject({
      cardRulesVersion: 2,
      slug: "golden_goal",
      effectConfig: { bonus: 3 },
    });
  });

  it("rejects a scout target that is not below the market median", async () => {
    const { pool, query } = createMockPool(async (sql) => {
      if (sql.includes("SELECT 1 FROM public.rounds round_item")) return { rows: [{}], rowCount: 1 };
      if (sql.includes("FROM public.fantasy_user_cards owned JOIN")) {
        return { rows: [{ id: "uc1", card_id: "c1", status: "OWNED", slug: "scout",
          name: "Caça-Talentos", rarity: "EPIC", effect_type: "CONDITIONAL_PLAYER_BONUS",
          effect_config: {} }], rowCount: 1 };
      }
      if (sql.includes("FROM public.fantasy_card_activations WHERE")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM public.league_members member")) return { rows: [{ id: "p1" }], rowCount: 1 };
      if (sql.includes("FROM public.fantasy_lineup_players item")) return { rows: [{ id: "p1" }], rowCount: 1 };
      if (sql.includes("percentile_cont")) return { rows: [{ target_price: 10, market_min: 5, market_max: 12, market_median: 8 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const result = await new PgCardsRepository(pool).activateCardForRound({
      leagueId: "l1", userId: "u1", roundId: "r1", userCardId: "uc1", targetPlayerId: "p1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("mediana");
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT INTO public.fantasy_card_activations"))).toBe(false);
  });

  it("checks administration through the authenticated league policy", async () => {
    const { pool, query } = createMockPool(async (sql) =>
      sql.includes("is_league_admin") ? { rows: [{ allowed: true }], rowCount: 1 } : { rows: [], rowCount: 0 });
    expect(await new PgCardsRepository(pool).isLeagueAdmin("l1", "u1")).toBe(true);
    expect(query).toHaveBeenCalledWith("SELECT public.is_league_admin($1::uuid) allowed", ["l1"]);
  });
});
