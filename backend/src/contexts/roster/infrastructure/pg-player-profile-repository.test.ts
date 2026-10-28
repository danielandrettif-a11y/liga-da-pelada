import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgPlayerProfileRepository } from "./pg-player-profile-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };
const command = {
  playerId, name: "Jogador", nickname: null, profileBio: null, avatarUrl: null,
  avatarAlternateUrl: null, playerProfile: "offensive" as const, overallTraits: ["offensive" as const],
  isGoalkeeper: false, memberCategory: "guest" as const, isSelectable: true,
};
const accessRow = {
  profile_bio: null, avatar_url: "old.png", avatar_alternate_url: null, member_category: "guest",
  is_selectable: true, player_profile: "offensive", overall_traits: ["offensive"],
  is_goalkeeper: false, is_owner: false,
};

function poolWith(query: ReturnType<typeof vi.fn>): Pool {
  return { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
}

describe("pgPlayerProfileRepository", () => {
  it("creates identity and membership in one authenticated transaction", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: true }] } : { rows: [] });
    await pgPlayerProfileRepository(poolWith(query)).saveProfile(leagueId, command, true, actor);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO public.players"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO public.league_members"))).toBe(true);
    expect(query).toHaveBeenCalledWith("COMMIT");
  });

  it("allows the owner to edit identity while keeping membership writes admin-only", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: false }] }
      : sql.includes("FROM public.league_members member") ? { rows: [{ ...accessRow, is_owner: true }] }
        : { rows: [] });
    await pgPlayerProfileRepository(poolWith(query)).saveProfile(leagueId, command, false, actor);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE public.players"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE public.league_members"))).toBe(false);
  });

  it("rejects deletion before reading the target when the actor is not a league admin", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: false }] } : { rows: [] });
    await expect(pgPlayerProfileRepository(poolWith(query)).delete(leagueId, playerId, actor))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("FOR UPDATE"))).toBe(false);
  });

  it("returns avatar URLs after deleting a league-scoped player", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin")
      ? { rows: [{ allowed: true }] }
      : sql.includes("FOR UPDATE") ? { rows: [{ avatar_url: "active.png", avatar_alternate_url: "extra.png" }] }
        : { rows: [] });
    await expect(pgPlayerProfileRepository(poolWith(query)).delete(leagueId, playerId, actor))
      .resolves.toEqual({ avatarUrl: "active.png", avatarAlternateUrl: "extra.png" });
    expect(query).toHaveBeenCalledWith("DELETE FROM public.players WHERE id = $1::uuid", [playerId]);
  });
});
