import { describe, expect, it, vi } from "vitest";
import { PgDashboardRepository } from "./pg-dashboard-repository";
import type { DatabaseConnection } from "../../../shared/infrastructure/database/database-connection";

describe("Statistics Infrastructure: PgDashboardRepository", () => {
  it("queries active season id", async () => {
    const mockDb: DatabaseConnection = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "season-123" }] }),
      transaction: vi.fn(),
    };
    const repo = new PgDashboardRepository(mockDb);
    const result = await repo.getActiveSeasonId("league-1");
    expect(result).toBe("season-123");
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id FROM seasons"),
      ["league-1"],
    );
  });

  it("returns dashboard data from read model when available", async () => {
    const mockDb: DatabaseConnection = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [
          {
            read_model: {
              league: { matchDuration: 8, stadiumName: "Arena VIP" },
              nextRound: { id: "r1", number: 1 },
              nextFriendly: null,
              liveMatch: null,
              lastRound: null,
              activeCallups: [],
            },
          },
        ],
      }),
      transaction: vi.fn(),
    };
    const repo = new PgDashboardRepository(mockDb);
    const data = await repo.getDashboardData("league-1", "season-1");
    expect(data.league?.matchDuration).toBe(8);
    expect(data.nextRound?.id).toBe("r1");
  });
});

