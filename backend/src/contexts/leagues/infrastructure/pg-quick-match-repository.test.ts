import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgQuickMatchRepository } from "./pg-quick-match-repository.js";

describe("pgQuickMatchRepository", () => {
  it("runs the atomic RPC with verified claims and returns every identifier", async () => {
    const session = { league_id: "league-1", callup_id: "callup-1", round_id: "round-1" };
    const query = vi.fn(async (sql: string) => sql.includes("create_quick_match_session")
      ? { rows: [{ session }] }
      : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repository = pgQuickMatchRepository(pool);
    await expect(repository.create({
      date: "2026-10-24", startTime: "20:30", fieldName: "Arena", mapUrl: "",
      playersPerTeam: 5, teamsPerRound: 3,
    }, { userId: "verified-user" })).resolves.toEqual(session);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("create_quick_match_session"), [
      "2026-10-24", "20:30", "Arena", "", 5, 3,
    ]);
    expect(query).toHaveBeenCalledWith("COMMIT");
  });
});
