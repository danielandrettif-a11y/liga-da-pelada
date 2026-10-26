import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgLeagueConfigRepository } from "./pg-league-config-repository.js";

const actor = { userId: "verified-user" };
const leagueId = "00000000-0000-4000-8000-000000000001";

function fixture(options: { activeCallup?: boolean; duplicate?: boolean } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
    if (sql.includes("SELECT league.id")) return { rows: [{ id: leagueId, name: "Pelada BQ", can_manage: true }] };
    if (sql.includes("SELECT players_per_team")) return { rows: [{ players_per_team: 5, teams_per_round: 3 }] };
    if (sql.includes("FROM public.callups")) return { rows: options.activeCallup ? [{ exists: 1 }] : [] };
    if (sql.includes("SET name") && options.duplicate) throw Object.assign(new Error("duplicate"), { code: "23505" });
    if (sql.includes("SET name")) return { rows: [{ name: "Novo nome" }] };
    if (sql.includes("RETURNING id")) return { rows: [{ id: leagueId }] };
    return { rows: [] };
  });
  const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
  return { repository: pgLeagueConfigRepository(pool), query };
}

describe("pgLeagueConfigRepository", () => {
  it("reads and updates configuration under verified PostgreSQL claims", async () => {
    const { repository, query } = fixture();
    await expect(repository.getConfig(leagueId, actor)).resolves.toMatchObject({ id: leagueId, can_manage: true });
    await expect(repository.updateName(leagueId, "Novo nome", actor)).resolves.toBe("Novo nome");
    await expect(repository.updateSettings(leagueId, {
      matchDuration: 8, playersPerTeam: 6, teamsPerRound: 3,
      stadiumName: "Arena", stadiumMapUrl: "https://maps.example/arena", eventDurationMinutes: 150,
    }, actor)).resolves.toBeUndefined();
    await expect(repository.setPreseason(leagueId, true, actor)).resolves.toBeUndefined();
    expect(query.mock.calls.filter(([sql]) => sql === "SET LOCAL ROLE authenticated")).toHaveLength(4);
    expect(query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(4);
  });

  it("rejects format changes while a callup is active and rolls back", async () => {
    const { repository, query } = fixture({ activeCallup: true });
    await expect(repository.updateSettings(leagueId, {
      matchDuration: 8, playersPerTeam: 6, teamsPerRound: 3,
      stadiumName: null, stadiumMapUrl: null, eventDurationMinutes: 120,
    }, actor)).rejects.toMatchObject({ statusCode: 409 });
    expect(query.mock.calls.filter(([sql]) => sql === "ROLLBACK")).toHaveLength(1);
  });

  it("maps duplicate names to a conflict", async () => {
    const { repository } = fixture({ duplicate: true });
    await expect(repository.updateName(leagueId, "Novo nome", actor)).rejects.toMatchObject({ statusCode: 409 });
  });
});
