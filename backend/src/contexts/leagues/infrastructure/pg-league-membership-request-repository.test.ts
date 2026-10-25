import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgLeagueMembershipRequestRepository } from "./pg-league-membership-request-repository.js";

function fixture(rpcResult: boolean | Error) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("request_league_membership_by_id")) {
      if (rpcResult instanceof Error) throw rpcResult;
      return { rows: [{ requested: rpcResult }] };
    }
    return { rows: [] };
  });
  const release = vi.fn();
  const pool = { connect: vi.fn().mockResolvedValue({ query, release }) } as unknown as Pool;
  return { repository: pgLeagueMembershipRequestRepository(pool), query, release };
}

describe("pgLeagueMembershipRequestRepository", () => {
  it("requests membership under verified PostgreSQL claims", async () => {
    const { repository, query } = fixture(true);
    await expect(repository.request("00000000-0000-4000-8000-000000000001", { userId: "verified-user" })).resolves.toBe(true);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN", "SET LOCAL ROLE authenticated", expect.stringContaining("request.jwt.claim.sub"),
      expect.stringContaining("request_league_membership_by_id"), "COMMIT",
    ]);
  });

  it("translates open leagues to a conflict and rolls back", async () => {
    const { repository, query } = fixture(new Error("Esta pelada esta aberta; entre diretamente pelo catalogo."));
    await expect(repository.request("00000000-0000-4000-8000-000000000001", { userId: "verified-user" }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
});
