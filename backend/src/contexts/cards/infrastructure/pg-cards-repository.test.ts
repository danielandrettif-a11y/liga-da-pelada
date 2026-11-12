import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgCardsRepository } from "./pg-cards-repository.js";

describe("Infrastructure: PgCardsRepository", () => {
  const createMockPool = (queryHandler: (sql: string, params?: any[]) => Promise<any>): Pool => {
    const client = {
      query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("SET LOCAL ROLE") || sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("SET LOCAL search_path")) {
          return Promise.resolve({});
        }
        return queryHandler(sql, params);
      }),
      release: vi.fn(),
    };
    return {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;
  };

  it("retrieves user packs and separates available from claimed", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("FROM public.fantasy_round_packs")) {
        return {
          rows: [
            { id: "p1", user_id: "u1", league_id: "l1", status: "available", created_at: "" },
            { id: "p2", user_id: "u1", league_id: "l1", status: "claimed", created_at: "" },
          ],
        };
      }
      if (sql.includes("FROM public.fantasy_pack_offers")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const repo = new PgCardsRepository(pool);
    const result = await repo.getMyPacks("l1", "u1");

    expect(result.totalPacks).toBe(2);
    expect(result.availablePacks.length).toBe(1);
    expect(result.claimedCount).toBe(1);
  });

  it("opens pack and returns 2 card offers", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("SELECT id, status FROM public.fantasy_round_packs")) {
        return { rows: [{ id: "p1", status: "available" }] };
      }
      if (sql.includes("FROM public.fantasy_pack_offers")) {
        return { rows: [] };
      }
      if (sql.includes("FROM public.fantasy_cards")) {
        return {
          rows: [
            { id: "c1", slug: "artilheiro-nato", name: "Artilheiro", description: "", rarity: "rare", requires_target: true },
            { id: "c2", slug: "muralha-defensiva", name: "Muralha", description: "", rarity: "common", requires_target: false },
          ],
        };
      }
      return { rows: [] };
    });

    const repo = new PgCardsRepository(pool);
    const result = await repo.openPack("l1", "u1", "p1");

    expect(result.success).toBe(true);
    expect(result.offers?.length).toBe(2);
  });

  it("activates card for round with conflict resolution", async () => {
    let executedSql = "";
    const pool = createMockPool(async (sql) => {
      executedSql = sql;
      if (sql.includes("FROM public.fantasy_user_cards")) {
        return { rows: [{ card_id: "c1", slug: "luva-de-ouro" }] };
      }
      return { rows: [] };
    });

    const repo = new PgCardsRepository(pool);
    const result = await repo.activateCardForRound({
      leagueId: "l1",
      userId: "u1",
      roundId: "r1",
      userCardId: "uc1",
      targetPlayerId: "p1",
    });

    expect(result.success).toBe(true);
    expect(executedSql).toContain("UPDATE public.fantasy_user_cards SET status = 'RESERVED'");
  });
});
