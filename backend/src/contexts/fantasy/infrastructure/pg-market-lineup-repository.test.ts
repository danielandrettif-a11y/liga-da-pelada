import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgFantasyMarketLineupRepository } from "./pg-market-lineup-repository.js";

describe("Infrastructure: PgFantasyMarketLineupRepository", () => {
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

  it("checks admin status correctly", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("public.is_league_admin")) {
        return { rows: [{ allowed: 1 }], rowCount: 1 };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const isAdmin = await repo.isLeagueAdmin("league-1", "user-1");
    expect(isAdmin).toBe(true);
  });

  it("returns dashboard data with players and calculated balance", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("FROM public.leagues")) {
        return { rows: [{ feature_tier: "complete" }] };
      }
      if (sql.includes("FROM public.seasons season") && sql.includes("fantasy_seasons")) {
        return { rows: [{ fantasy_season_id: "season-1", initial_budget: 100 }] };
      }
      if (sql.includes("FROM public.fantasy_rounds fantasy_round")) {
        return { rows: [{ fantasy_round_id: "fantasy-round-1", round_id: "round-1", number: 1, market_status: "open" }] };
      }
      if (sql.includes("FROM public.fantasy_accounts")) {
        return { rows: [{ current_budget: 100 }] };
      }
      if (sql.includes("FROM public.fantasy_lineups lineup") && sql.includes("lineup.user_id")) {
        return { rows: [] };
      }
      if (sql.includes("FROM public.league_members member")) {
        return { rows: [{ id: "p1", name: "Player 1", current_price: 8.5, is_goalkeeper: false, total_points: 75, rounds_played: 1 }] };
      }
      if (sql.includes("count(*)::int count FROM public.fantasy_lineups")) {
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
      if (sql.includes("public.save_fantasy_lineup")) {
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
      if (sql.includes("FROM public.fantasy_rounds fantasy_round")) {
        return { rows: [{ id: "fantasy-round-1", market_status: "closed" }] };
      }
      if (sql.includes("FROM public.fantasy_lineups lineup")) {
        return {
          rows: [
            {
              id: "l1",
              user_id: "u1",
              captain_player_id: "p1",
              slots: [],
              score: 45.5,
              total_cost: 95,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const result = await repo.getRevealedLineups("league-1", "user-1", "round-1");

    expect(result.allowed).toBe(true);
    expect(result.lineups.length).toBe(1);
    expect(result.lineups[0].score).toBe(45.5);
  });

  it("blocks revealed lineups when market is open", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("FROM public.fantasy_rounds fantasy_round")) {
        return { rows: [{ id: "fantasy-round-1", market_status: "open" }] };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const result = await repo.getRevealedLineups("league-1", "user-1", "round-1");

    expect(result.allowed).toBe(false);
    expect(result.error).toContain("após o fechamento do mercado");
  });
});

