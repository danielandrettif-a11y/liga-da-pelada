import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PgFantasyAdminRepository } from "./pg-fantasy-admin-repository.js";

describe("Infrastructure: PgFantasyAdminRepository", () => {
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

  it("retrieves raw ranking entries", async () => {
    const pool = createMockPool(async (sql) => {
      if (sql.includes("FROM fantasy_lineups fl")) {
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
    let executedSql = "";
    const pool = createMockPool(async (sql) => {
      executedSql = sql;
      return { rows: [] };
    });

    const repo = new PgFantasyAdminRepository(pool);
    const res = await repo.updateSettings("l1", { initialBudget: 120 });
    expect(res.success).toBe(true);
    expect(executedSql).toContain("INSERT INTO fantasy_settings");
  });

  it("handles test session create and reset", async () => {
    const pool = createMockPool(async () => ({ rows: [] }));
    const repo = new PgFantasyAdminRepository(pool);

    expect((await repo.createTestSession("l1", "r1")).success).toBe(true);
    expect((await repo.processTestSession("l1", "r1")).success).toBe(true);
    expect((await repo.resetTestSession("l1", "r1")).success).toBe(true);
  });
});
