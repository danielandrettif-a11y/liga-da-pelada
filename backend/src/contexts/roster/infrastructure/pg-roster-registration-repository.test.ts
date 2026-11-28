import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgRosterRegistrationRepository } from "./pg-roster-registration-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const guestId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("pgRosterRegistrationRepository", () => {
  it("lists only registration events returned for the administered league", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: true }] }
      : sql.includes("get_league_registration_history") ? { rows: [{
        id: "7", player_id: guestId, player_name: "Nome atual", avatar_url: null,
        member_category: "guest", source: "site_signup", created_by_user_id: "u-creator",
        created_by_name: "Daniel", created_by_avatar_url: null,
        origin_type: "registered_by_user", signup_email: null, signup_provider: null,
        created_at: "2026-10-20T10:00:00.000Z",
      }] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgRosterRegistrationRepository(pool).listHistory(leagueId, actor))
      .resolves.toMatchObject([{
        id: 7,
        player_name: "Nome atual",
        created_by_name: "Daniel",
        origin_type: "registered_by_user",
      }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("get_league_registration_history($1::uuid)"), [leagueId]);
  });

  it("rejects registration reads before querying private data when the actor is not an admin", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: false }] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgRosterRegistrationRepository(pool).listHistory(leagueId, actor))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("get_league_registration_history"))).toBe(false);
  });

  it("requires the requested guest and every candidate to belong to the same active league", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: true }] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgRosterRegistrationRepository(pool).listMergeCandidates(leagueId, guestId, actor))
      .resolves.toEqual([]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("target.player_id = $2::uuid"), [leagueId, guestId]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("player.member_category IN"), [leagueId, guestId]);
  });

  it("preserves the active match conflict returned by the merge function", async () => {
    const registeredId = "00000000-0000-4000-8000-000000000002";
    const message = "Encerre a partida ativa antes de unir os perfis.";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("can_merge_profiles_in_league")) return { rows: [{ can_merge: true }] };
      if (sql.includes("merge_selectable_player_profiles")) {
        throw Object.assign(new Error(message), { code: "P0001" });
      }
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;

    await expect(pgRosterRegistrationRepository(pool).mergePlayers(leagueId, guestId, registeredId, actor))
      .rejects.toMatchObject({ statusCode: 409, message });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("merges player profiles atomically when league permission and scope check succeed", async () => {
    const registeredId = "00000000-0000-4000-8000-000000000002";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("is_league_admin")) return { rows: [{ allowed: true }] };
      if (sql.includes("can_merge_profiles_in_league")) return { rows: [{ can_merge: true }] };
      if (sql.includes("merge_selectable_player_profiles")) return { rows: [{ affected_rounds: ["00000000-0000-4000-8000-000000000100"] }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgRosterRegistrationRepository(pool).mergePlayers(leagueId, guestId, registeredId, actor))
      .resolves.toEqual(["00000000-0000-4000-8000-000000000100"]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("can_merge_profiles_in_league"), [leagueId, guestId, registeredId],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("merge_selectable_player_profiles"), [guestId, registeredId],
    );
  });
});
