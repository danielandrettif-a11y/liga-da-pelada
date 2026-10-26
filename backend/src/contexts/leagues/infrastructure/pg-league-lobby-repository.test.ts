import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgLeagueLobbyRepository } from "./pg-league-lobby-repository.js";

function fixture() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("join_open_league")) return { rows: [{ joined: true }] };
    if (sql.includes("UPDATE public.league_members")) return { rows: [{ favorite: false }] };
    if (sql.includes("request_league_membership")) return { rows: [{ league_id: "league-1" }] };
    return { rows: [] };
  });
  const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
  return { repository: pgLeagueLobbyRepository(pool), query };
}

describe("pgLeagueLobbyRepository", () => {
  it("executes lobby RPCs inside authenticated transactions", async () => {
    const { repository, query } = fixture();
    const actor = { userId: "verified-user" };
    await expect(repository.joinOpen("league-1", actor)).resolves.toBe(true);
    await expect(repository.setFavorite("league-1", false, actor)).resolves.toBe(false);
    await expect(repository.requestByInvite("invite-1", actor)).resolves.toBe("league-1");
    expect(query.mock.calls.filter(([sql]) => sql === "SET LOCAL ROLE authenticated")).toHaveLength(3);
    expect(query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(3);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("SET is_favorite = $2::boolean"), ["league-1", false]);
  });
});
