import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgLeagueAdminRepository } from "./pg-league-admin-repository.js";

describe("pgLeagueAdminRepository", () => {
  it("executes admin RPCs with verified claims and commits", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("review_league_membership")) return { rows: [{ reviewed: true }] };
      if (sql.includes("add_account_to_league")) return { rows: [{ added: true }] };
      if (sql.includes("set_league_visibility")) return { rows: [{ updated: true }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repository = pgLeagueAdminRepository(pool);
    const actor = { userId: "verified-user" };
    await expect(repository.reviewMembershipRequest("request-1", true, actor)).resolves.toBe(true);
    await expect(repository.addAccount("league-1", "user-1", actor)).resolves.toBe(true);
    await expect(repository.setVisibility("league-1", "open", actor)).resolves.toBe(true);
    expect(query.mock.calls.filter(([sql]) => sql === "SET LOCAL ROLE authenticated")).toHaveLength(3);
    expect(query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(3);
  });
});
