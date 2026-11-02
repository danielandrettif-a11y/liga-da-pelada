import { describe, expect, it, vi } from "vitest";
import { PgDashboardRepository } from "./pg-dashboard-repository";
import type { Pool, PoolClient } from "pg";

describe("Statistics Infrastructure: PgDashboardRepository", () => {
  const actor = { userId: "11111111-1111-4111-8111-111111111111" };
  const pool = (query: ReturnType<typeof vi.fn>) => ({
    connect: vi.fn().mockResolvedValue({ query, release: vi.fn() } as unknown as PoolClient),
  }) as unknown as Pool;

  it("queries active season id", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => sql.includes("FROM public.seasons")
      ? { rows: [{ id: "season-123" }] } : { rows: [] });
    const repo = new PgDashboardRepository(pool(query));
    const result = await repo.getActiveSeasonId(actor, "league-1");
    expect(result).toBe("season-123");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT season.id FROM public.seasons"),
      ["league-1"],
    );
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("returns dashboard data from read model when available", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => sql.includes("get_home_read_model") ? {
        rows: [
          {
            read_model: {
              league: { match_duration: 8, stadium_name: "Arena VIP", event_duration_minutes: 120 },
              nextRound: { id: "r1", number: 1 },
              nextFriendly: null,
              liveMatch: null,
              lastRound: null,
              activeCallups: [],
            },
          },
        ],
      } : { rows: [] });
    const repo = new PgDashboardRepository(pool(query));
    const data = await repo.getDashboardData(actor, "league-1", "season-1");
    expect(data.league?.matchDuration).toBe(8);
    expect(data.nextRound?.id).toBe("r1");
  });
});

