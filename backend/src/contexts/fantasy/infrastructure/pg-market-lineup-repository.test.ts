import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgFantasyMarketLineupRepository } from "./pg-market-lineup-repository.js";

describe("Infrastructure: PgFantasyMarketLineupRepository", () => {
  const createMockPool = (queryHandler: (sql: string, params?: any[]) => Promise<any>): Pool => {
    const client = {
      query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
        if (
          sql.includes("SET LOCAL ROLE") ||
          sql.includes("BEGIN") ||
          sql.includes("COMMIT") ||
          sql.includes("SET LOCAL search_path")
        ) {
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

  it("checks admin status correctly", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("public.league_members")) {
        return { rows: [{ is_admin: true }] };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const isAdmin = await repo.isLeagueAdmin("league-1", "user-1");
    expect(isAdmin).toBe(true);
  });

  it("returns dashboard data with players and calculated balance", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("public.leagues")) {
        return { rows: [{ feature_tier: "complete" }] };
      }
      if (sql.includes("public.fantasy_settings")) {
        return { rows: [{ initial_budget: 100 }] };
      }
      if (sql.includes("public.rounds")) {
        return { rows: [{ id: "round-1", number: 1, status: "draft", market_status: "open" }] };
      }
      if (sql.includes("public.fantasy_lineups") && sql.includes("user_id = $2")) {
        return { rows: [] };
      }
      if (sql.includes("public.players")) {
        return { rows: [{ id: "p1", name: "Player 1", price: 8.5, isGoalkeeper: false, overall: 75 }] };
      }
      if (sql.includes("COUNT(*)::int as count")) {
        return { rows: [{ count: 3 }] };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const data = await repo.getDashboard("league-1", "user-1");

    expect(data.authenticated).toBe(true);
    expect(data.available).toBe(true);
    expect(data.marketOpen).toBe(true);
    expect(data.budget).toBe(100);
    expect(data.spent).toBe(0);
    expect(data.balance).toBe(100);
    expect(data.players.length).toBe(1);
    expect(data.confirmedCount).toBe(3);
  });

  it("saves lineup and returns lineupId", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("save_fantasy_lineup_with_reserve")) {
        return { rows: [{ lineup_id: "lineup-xyz" }] };
      }
      if (sql.includes("INSERT INTO public.fantasy_lineups")) {
        return { rows: [{ id: "lineup-xyz" }] };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const result = await repo.saveLineup({
      leagueId: "l1",
      roundId: "r1",
      userId: "u1",
      captainPlayerId: "p1",
      slots: [{ slotRole: "ATA", playerId: "p1" }],
      totalCost: 10,
    });

    expect(result.success).toBe(true);
    expect(result.lineupId).toBe("lineup-xyz");
  });

  it("returns revealed lineups only when market is closed", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("public.rounds")) {
        return { rows: [{ status: "finished", market_status: "closed" }] };
      }
      if (sql.includes("public.fantasy_lineups")) {
        return {
          rows: [
            {
              id: "l1",
              user_id: "u1",
              captain_player_id: "p1",
              score: 45.5,
              total_cost: 95,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const result = await repo.getRevealedLineups("league-1", "round-1");

    expect(result.allowed).toBe(true);
    expect(result.lineups.length).toBe(1);
    expect(result.lineups[0].score).toBe(45.5);
  });

  it("blocks revealed lineups when market is open", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("public.rounds")) {
        return { rows: [{ status: "draft", market_status: "open" }] };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const result = await repo.getRevealedLineups("league-1", "round-1");

    expect(result.allowed).toBe(false);
    expect(result.error).toContain("após o fechamento do mercado");
  });
});
