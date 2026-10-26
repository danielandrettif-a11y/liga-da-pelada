import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgAccountCareerRepository } from "./pg-account-career-repository.js";

describe("pgAccountCareerRepository", () => {
  it("reads the projection with verified claims and normalizes PostgreSQL numbers", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("get_my_account_career_stats")
      ? { rows: [{
          league_id: "league-1", league_name: "Pelada BQ", round_type: "official",
          rounds_count: "2", games: 3, goals: "4", assists: 1, wins: 2, draws: 0, losses: 1,
          points: "6.5", goalkeeper_games: 0, goals_conceded: 0, clean_sheets: 0, play_seconds: "900",
        }] }
      : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const rows = await pgAccountCareerRepository(pool).listForAccount({ userId: "verified-user" });
    expect(query).toHaveBeenCalledWith("SET LOCAL ROLE authenticated");
    expect(query).toHaveBeenCalledWith("SELECT * FROM public.get_my_account_career_stats()");
    expect(rows[0]).toMatchObject({ rounds_count: 2, goals: 4, points: 6.5, play_seconds: 900 });
  });

  it("does not leak malformed database responses", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("get_my_account_career_stats")
      ? { rows: [{ round_type: "unknown" }] }
      : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgAccountCareerRepository(pool).listForAccount({ userId: "verified-user" }))
      .rejects.toThrow("carreira da conta");
  });
});
