import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgFantasyAdminRepository } from "./pg-fantasy-admin-repository.js";

describe("Infrastructure: PgFantasyAdminRepository", () => {
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

  it("retrieves raw ranking entries", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("FROM public.fantasy_lineups fl")) {
        return {
          rows: [
            {
              user_id: "u1",
              user_name: "Cartoleiro 1",
              user_avatar_url: null,
              total_points: 150.5,
              patrimony: 100,
              lineups_count: 5,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const repo = new PgFantasyAdminRepository(pool);
    const rows = await repo.getRankingRawEntries("l1", "season");
    expect(rows.length).toBe(1);
    expect(rows[0].totalPoints).toBe(150.5);
  });

  it("updates fantasy settings initial budget", async () => {
    const calls: Array<{sql: string; params?: any[]}> = [];
    const pool = createMockPool(async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ result: true }] };
    });

    const repo = new PgFantasyAdminRepository(pool);
    const res = await repo.updateSettings("l1", { initial_budget: 120 }, "u1");
    expect(res.success).toBe(true);
    expect(calls.some(c => c.sql.includes("update_fantasy_settings_for_league") && c.params?.[1] === '{"initial_budget":120}')).toBe(true);
    expect(calls.some(c => c.sql.includes("set_config") && c.params?.[0] === "u1")).toBe(true);
  });

  it("builds the pass from the authenticated member's actual progress and events", async () => {
    const calls: Array<{ sql: string; params?: any[] }> = [];
    const pool = createMockPool(async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("FROM public.account_profiles profile")) return { rows: [{ fantasy_season_id: "fs1", name: "Pessoa", member_category: "supporter" }] };
      if (sql.includes("FROM public.fantasy_season_passes")) return { rows: [{ progress: 6, valid_lineups: 2, shop_bonus_points: 3 }] };
      if (sql.includes("FROM public.fantasy_season_pass_events")) return { rows: [{ id: "e1", event_type: "valid_lineup", houses: 1, source_round_id: "r1", round_number: 3, round_date: "2026-01-01", created_at: "2026-01-01" }] };
      return { rows: [] };
    });
    const result = await new PgFantasyAdminRepository(pool).getSeasonPassDashboard("l1", "u1");
    expect(result).toMatchObject({ available: true, progress: 6, maxProgress: 40, mode: "community", nextMilestone: 10, validLineups: 2, shopBonusPoints: 3, events: [{ id: "e1", roundId: "r1", roundNumber: 3 }] });
    expect(calls.some(c => c.sql.includes("set_config") && c.params?.[0] === "u1")).toBe(true);
    expect(calls.some(c => c.sql.includes("public.is_league_member") && c.params?.join(",") === "l1,u1")).toBe(true);
  });

  it("reads admin data in the selected league using the actor's identity", async () => {
    const calls: Array<{ sql: string; params?: any[] }> = [];
    const pool = createMockPool(async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("AS allowed")) return { rows: [{ allowed: true }] };
      if (sql.includes("to_jsonb(s)")) return { rows: [{ value: { initial_budget: 55 } }] };
      if (sql.includes("SELECT fs.id, s.id AS season_id")) return { rows: [{ id: "fs1", season_id: "s1" }] };
      if (sql.includes("FROM public.fantasy_rounds fr")) return { rows: [{ id: "fr1", round: { id: "r1" } }] };
      if (sql.includes("FROM public.fantasy_test_sessions ts")) return { rows: [{ value: { id: "t1" } }] };
      if (sql.includes("AS value FROM public.rounds r")) return { rows: [{ value: { id: "r2" } }] };
      if (sql.includes("get_fantasy_market_v11_status")) return { rows: [{ value: { version: 11 } }] };
      return { rows: [] };
    });
    const result = await new PgFantasyAdminRepository(pool).getAdminData("l1", "u1");
    expect(result).toEqual({ settings: { initial_budget: 55 }, rounds: [{ id: "fr1", round: { id: "r1" } }], testSession: { id: "t1" }, friendlyRounds: [{ id: "r2" }], marketStatus: { version: 11 } });
    expect(calls.some(c => c.sql.includes("set_config") && c.params?.[0] === "u1")).toBe(true);
    expect(calls.some(c => c.sql.includes("AS allowed") && c.params?.[0] === "l1")).toBe(true);
  });

  it("scopes test session operations and executes their database functions as the actor", async () => {
    const calls: Array<{ sql: string; params?: any[] }> = [];
    const pool = createMockPool(async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("FROM public.rounds")) return { rowCount: 1, rows: [{}] };
      if (sql.includes("SELECT public.")) return { rows: [{ result: true }] };
      return { rows: [] };
    });
    const repo = new PgFantasyAdminRepository(pool);

    expect((await repo.createTestSession("l1", "r1", "u1")).success).toBe(true);
    expect((await repo.processTestSession("l1", "r1", "u1")).success).toBe(true);
    expect((await repo.resetTestSession("l1", "r1", "u1")).success).toBe(true);
    expect(calls.filter(c => c.sql.includes("set_config")).every(c => c.params?.[0] === "u1")).toBe(true);
    expect(calls.filter(c => c.sql.includes("FROM public.rounds")).every(c => c.params?.join(",") === "r1,l1")).toBe(true);
    expect(calls.some(c => c.sql.includes("public.create_fantasy_test_session"))).toBe(true);
    expect(calls.some(c => c.sql.includes("public.process_fantasy_test_round"))).toBe(true);
    expect(calls.some(c => c.sql.includes("public.reset_fantasy_test_session"))).toBe(true);
  });
});
