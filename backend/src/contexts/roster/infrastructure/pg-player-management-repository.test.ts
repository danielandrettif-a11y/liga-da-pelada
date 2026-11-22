import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgPlayerManagementRepository } from "./pg-player-management-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };
const row = {
  id: playerId, name: "Convidado", nickname: null, profile_bio: null, avatar_url: "active.jpg",
  avatar_alternate_url: "alternate.jpg", player_profile: "offensive", initial_player_profile: "offensive",
  profile_decision_source: "initial", profile_source_round_id: null, overall_traits: ["offensive"],
  overall_seed_mode: "observed", is_goalkeeper: false, member_category: "guest", is_selectable: true,
  show_fitness_stats: false, registration_source: "admin", profile_scope: "persistent",
  created_by_user_id: null, created_at: "2026-10-20T10:00:00.000Z", league_player_profile: "offensive",
  league_initial_player_profile: "offensive", league_overall_traits: ["offensive"],
  league_overall_seed_mode: "observed",
};

function poolWith(query: ReturnType<typeof vi.fn>): Pool {
  return { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
}

describe("pgPlayerManagementRepository", () => {
  it("creates player identity and league membership atomically", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: true }] }
      : sql.includes("JOIN public.players") ? { rows: [row] } : { rows: [] });
    const target = pgPlayerManagementRepository(poolWith(query));
    await expect(target.create(leagueId, {
      name: "Convidado", nickname: null, avatarUrl: null, playerProfile: "offensive",
      overallTraits: ["offensive"], memberCategory: "guest", isSelectable: true,
    }, actor)).resolves.toMatchObject({ id: playerId });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO public.league_members"), [
      leagueId, expect.stringMatching(/^[0-9a-f-]{36}$/), "offensive", ["offensive"],
    ]);
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects updates before reading a player when the actor is not a league admin", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: false }] } : { rows: [] });
    const target = pgPlayerManagementRepository(poolWith(query));
    await expect(target.update(leagueId, playerId, { name: "Novo" }, actor))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("JOIN public.players"))).toBe(false);
  });

  it("updates identity and competitive profile in the same transaction", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: true }] }
      : sql.includes("JOIN public.players") ? { rows: [row] } : { rows: [] });
    const target = pgPlayerManagementRepository(poolWith(query));
    await target.update(leagueId, playerId, {
      name: "Novo", playerProfile: "defensive", overallTraits: ["defensive"],
    }, actor);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE public.players SET name"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE public.league_members SET"))).toBe(true);
  });

  it("allows an owner or global admin to swap two persisted avatars", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("FROM public.league_members")
      ? { rows: [{ allowed: true }] }
      : sql.includes("FROM public.account_profiles") ? { rows: [{ allowed: true }] }
        : sql.includes("FOR UPDATE") ? { rows: [{ avatar_url: "active.jpg", avatar_alternate_url: "alternate.jpg" }] }
          : { rows: [] });
    await pgPlayerManagementRepository(poolWith(query)).swapAvatars(leagueId, playerId, actor);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("avatar_url = $2"), [
      playerId, "alternate.jpg", "active.jpg",
    ]);
  });

  it("imports guests through the hardened league RPC", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: true }] }
      : sql.includes("import_league_guest_roster") ? { rows: [{
        created_name: "Ana", player_id: playerId, added_to_callup: true,
      }] } : { rows: [] });
    await expect(pgPlayerManagementRepository(poolWith(query)).importGuests(leagueId, ["Ana"], actor))
      .resolves.toEqual([{ createdName: "Ana", playerId, addedToCallup: true }]);
  });
});
