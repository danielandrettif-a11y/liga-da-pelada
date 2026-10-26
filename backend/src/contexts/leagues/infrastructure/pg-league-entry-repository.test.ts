import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { LeagueEntryPersistenceError, pgLeagueEntryRepository } from "./pg-league-entry-repository.js";

const actor = { userId: "verified-user" };
const leagueId = "00000000-0000-4000-8000-000000000001";

describe("pgLeagueEntryRepository", () => {
  it("uses verified database claims for completion and selection", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("AS allowed")
      ? { rows: [{ allowed: true }] }
      : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repository = pgLeagueEntryRepository(pool);
    await expect(repository.completeEntryFlow(1, actor)).resolves.toBeUndefined();
    await expect(repository.authorizeSelection(leagueId, "active", actor)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith("SET LOCAL ROLE authenticated");
    expect(query).toHaveBeenCalledWith("SELECT public.complete_my_entry_flow($1::integer)", [1]);
  });

  it("rejects a league that is not selectable by the verified account", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("AS allowed")
      ? { rows: [{ allowed: false }] }
      : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgLeagueEntryRepository(pool).authorizeSelection(leagueId, "archived-quick", actor))
      .rejects.toEqual(expect.objectContaining<Partial<LeagueEntryPersistenceError>>({ statusCode: 403 }));
  });
});
