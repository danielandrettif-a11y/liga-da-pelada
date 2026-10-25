import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgLeagueRepository } from "./pg-league-repository.js";

function fixture(failure?: Error & { code?: string }) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("public.create_league_for_user") && failure) throw failure;
    if (sql.includes("public.create_league_for_user")) return { rows: [{ league_id: "league-1" }] };
    return { rows: [] };
  });
  const release = vi.fn();
  const pool = { connect: vi.fn().mockResolvedValue({ query, release }) } as unknown as Pool;
  return { repository: pgLeagueRepository(pool), query, release };
}

describe("pgLeagueRepository", () => {
  it("executes the creation RPC in the verified user's transaction", async () => {
    const { repository, query, release } = fixture();
    await expect(repository.create({ name: "Pelada BQ", tier: "quick", visibility: "private" }, { userId: "verified-user" }))
      .resolves.toBe("league-1");
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN", "SET LOCAL ROLE authenticated", expect.stringContaining("request.jwt.claim.sub"),
      expect.stringContaining("public.create_league_for_user"), "COMMIT",
    ]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      "verified-user", JSON.stringify({ sub: "verified-user", role: "authenticated" }),
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back duplicate names", async () => {
    const conflict = Object.assign(new Error("unique violation"), { code: "23505" });
    const { repository, query } = fixture(conflict);
    await expect(repository.create({ name: "Pelada BQ", tier: "basic", visibility: "private" }, { userId: "verified-user" }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
});
