import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgCardsRepository } from "./pg-cards-repository.js";

describe("Infrastructure: PgCardsRepository", () => {
  const createMockPool = (queryHandler: (sql: string, params?: any[]) => Promise<any>): Pool => {
    const client = {
      query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes("SET LOCAL ROLE")) return Promise.resolve({});
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
      if (sql.includes("FROM fantasy_packs")) {
        return {
          rows: [
            { id: "p1", user_id: "u1", league_id: "l1", status: "unopened", created_at: "" },
            { id: "p2", user_id: "u1", league_id: "l1", status: "claimed", created_at: "" },
          ],
        };
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
      if (sql.includes("SELECT id, status FROM fantasy_packs")) {
        return { rows: [{ id: "p1", status: "unopened" }] };
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
      return { rows: [{ card_slug: "luva-de-ouro" }] };
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
    expect(executedSql).toContain("INSERT INTO fantasy_active_cards");
  });
});
