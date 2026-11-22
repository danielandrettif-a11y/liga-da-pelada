import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgRosterActivityRepository } from "./pg-roster-activity-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const actor = { userId: "verified-user" };

describe("pgRosterActivityRepository", () => {
  it("counts only events after the account marker in the administered league", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: true }] }
      : sql.includes("FROM public.admin_roster_reads")
        ? { rows: [{ last_seen_at: "2026-10-20T10:00:00.000Z" }] }
        : sql.includes("count(*)")
          ? { rows: [{ count: "3" }] }
          : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgRosterActivityRepository(pool).getUnreadState(leagueId, actor)).resolves.toEqual({
      count: 3, lastSeenAt: "2026-10-20T10:00:00.000Z",
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("member.league_id = $1::uuid"), [
      leagueId, "2026-10-20T10:00:00.000Z",
    ]);
  });

  it("rejects reads before querying private activity when the actor is not a league admin", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: false }] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgRosterActivityRepository(pool).listUnreadEvents(leagueId, actor))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("player_registration_events"))).toBe(false);
  });

  it("uses the hardened database functions for monotonic read updates", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: true }] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const target = pgRosterActivityRepository(pool);
    await target.markSeenThrough(leagueId, "2026-10-20T10:00:00.000Z", actor);
    await target.markSeen(leagueId, actor);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("mark_roster_activity_seen_through"),
      [leagueId, "2026-10-20T10:00:00.000Z"],
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("mark_roster_activity_seen($1::uuid)"), [leagueId]);
  });
});
