import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgLeagueBrandingRepository } from "./pg-league-branding-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("pgLeagueBrandingRepository", () => {
  it("reads and updates branding only after verified league-admin authorization", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("SELECT logo_url")) return { rows: [{ logo_url: "old-logo", cover_url: null }] };
      if (sql.includes("UPDATE public.leagues")) return { rows: [{ id: leagueId }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repository = pgLeagueBrandingRepository(pool);
    await expect(repository.getCurrent(leagueId, actor)).resolves.toEqual({ logoUrl: "old-logo", coverUrl: null });
    await expect(repository.update(leagueId, {
      accentColor: "#aabbcc", logoUrl: null,
    }, actor)).resolves.toBeUndefined();
    expect(query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(2);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE public.leagues"), [
      leagueId, "#aabbcc", true, null, false, null,
    ]);
  });
});
