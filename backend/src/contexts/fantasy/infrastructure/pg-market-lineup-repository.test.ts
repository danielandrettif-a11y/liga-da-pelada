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
      if (sql.includes("public.is_league_admin")) {
        return { rows: [{ is_admin: true }] };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const isAdmin = await repo.isLeagueAdmin("league-1", "user-1");
    expect(isAdmin).toBe(true);
  });

  it("reads the actor's history in the active season using their database identity", async () => {
    const calls: Array<{sql: string; params?: any[]}> = [];
    const item = { id: "lineup-1", status: "scored", total_points: 12, budget_before: 50, budget_after: 52, fantasy_rounds: { round_id: "r1", rounds: { number: 1 } } };
    const pool = createMockPool(async (sql, params) => {
      calls.push({ sql, params });
      return { rows: sql.includes("json_build_object('round_id'") ? [item] : [] };
    });
    const result = await new PgFantasyMarketLineupRepository(pool).getMyHistory("l1", "u1");
    expect(result).toEqual([item]);
    expect(calls.some(c => c.sql.includes("set_config") && c.params?.[0] === "u1")).toBe(true);
    expect(calls.some(c => c.sql.includes("s.status = 'active'") && c.params?.join(",") === "l1,u1")).toBe(true);
  });

  it("derives highlights from the latest actual prices of the active league season", async () => {
    const calls: Array<{sql: string; params?: any[]}> = [];
    const pool = createMockPool(async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("WITH latest AS")) return { rows: [
        { name: "A", avatar_url: null, round_points: "8", variation_rate: "0.2", price_change: "2" },
        { name: "B", avatar_url: null, round_points: "2", variation_rate: "-0.1", price_change: "-1" },
      ] };
      return { rows: [] };
    });
    const result = await new PgFantasyMarketLineupRepository(pool).getQuickHighlights("l1", "u1");
    expect(result?.topScorer).toMatchObject({ name: "A", points: 8 });
    expect(result?.topGain).toMatchObject({ name: "A", variation: 0.2, priceChange: 2 });
    expect(result?.topDrop).toMatchObject({ name: "B", variation: -0.1, priceChange: -1 });
    expect(calls.some(c => c.sql.includes("set_config") && c.params?.[0] === "u1")).toBe(true);
    expect(calls.some(c => c.sql.includes("public.is_league_member") && c.params?.[0] === "l1")).toBe(true);
  });

  it("previews the active season belonging to the selected league as the administrator", async () => {
    const calls: Array<{sql: string; params?: any[]}> = [];
    const pool = createMockPool(async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT fs.id FROM public.fantasy_seasons")) return { rows: [{ id: "fs1" }] };
      if (sql.includes("preview_fantasy_market_v11")) return { rows: [{ preview: { status: "ok" } }] };
      return { rows: [] };
    });
    const result = await new PgFantasyMarketLineupRepository(pool).previewMarketV11("l1", "u1");
    expect(result).toEqual({ success: true, preview: { status: "ok" } });
    expect(calls.some(c => c.sql.includes("set_config") && c.params?.[0] === "u1")).toBe(true);
    expect(calls.some(c => c.sql.includes("public.is_league_admin") && c.params?.[0] === "l1")).toBe(true);
    expect(calls.find(c => c.sql.includes("preview_fantasy_market_v11"))?.params).toEqual(["fs1"]);
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

  it("passes the authenticated complete lineup to the canonical transaction", async () => {
    const calls: Array<{sql: string; params?: any[]}> = [];
    const pool = createMockPool(async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("FROM public.rounds r JOIN")) return { rows: [{ players_per_team: 1, is_test: false }] };
      if (sql.includes("save_fantasy_lineup_with_reserve")) {
        return { rows: [{ id: "lineup-xyz" }] };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const result = await repo.saveLineup({
      leagueId: "l1",
      roundId: "r1",
      userId: "u1",
      input: { playerIds: ["p1"], captainId: "p1", scorerId: "p1", assistId: "p1", challengeId: "p1", reservePlayerId: "p2", reserveRole: "ATA", slotAssignments: [{ slotRole: "ATA", playerId: "p1", slotIndex: 0 }] },
    });

    expect(result).toMatchObject({ success: true, lineupId: "lineup-xyz", confirmed: true });
    expect(calls.some(c => c.sql.includes("set_config") && c.params?.[0] === "u1")).toBe(true);
    expect(calls.find(c => c.sql.includes("save_fantasy_lineup_with_reserve"))?.params).toEqual(["r1", ["p1"], "p1", "p1", "p1", "p1", JSON.stringify([{ player_id: "p1", slot_index: 0, slot_role: "ATA" }]), "p2", "ATA"]);
  });

  it("returns revealed lineups only when market is closed", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("public.rounds")) {
        return { rows: [{ id: "fr1", status: "finished", market_status: "finished" }] };
      }
      if (sql.includes("public.fantasy_lineups")) {
        return {
          rows: [
            {
              id: "l1",
              user_id: "u1",
              captain_player_id: "p1",
              score: 45.5,
              total_cost: 95, user_name: "Pessoa", players: [{ playerId: "p1", points: 45.5 }],
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
    expect(result.lineups[0]).toMatchObject({ totalPoints: 45.5, players: [{ playerId: "p1", points: 45.5 }] });
  });

  it("blocks revealed lineups when market is open", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("public.rounds")) {
        return { rows: [{ status: "draft", market_status: "open" }] };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyMarketLineupRepository(pool);
    const result = await repo.getRevealedLineups("league-1", "user-1", "round-1");

    expect(result.allowed).toBe(false);
    expect(result.error).toContain("após o fechamento do mercado");
  });
});
