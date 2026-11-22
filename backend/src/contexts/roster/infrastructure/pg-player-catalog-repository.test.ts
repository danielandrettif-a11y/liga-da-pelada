import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgPlayerCatalogRepository } from "./pg-player-catalog-repository.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };
const row = {
  id: playerId, name: "Jogador", nickname: null, profile_bio: null, avatar_url: null,
  avatar_alternate_url: null, player_profile: "offensive", initial_player_profile: "offensive",
  profile_decision_source: "initial", profile_source_round_id: null, overall_traits: ["offensive"],
  overall_seed_mode: "observed", is_goalkeeper: false, member_category: "player", is_selectable: true,
  show_fitness_stats: false, registration_source: "admin", profile_scope: "persistent",
  created_by_user_id: null, created_at: "2026-10-20T10:00:00.000Z", league_player_profile: "defensive",
  league_initial_player_profile: "defensive", league_overall_traits: ["defensive"],
  league_overall_seed_mode: "observed",
};

describe("pgPlayerCatalogRepository", () => {
  it("checks active league membership before listing the catalog", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: true }] }
      : sql.includes("JOIN public.players") ? { rows: [row] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgPlayerCatalogRepository(pool).list(leagueId, actor)).resolves.toMatchObject([
      { id: playerId, league_player_profile: "defensive" },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("member.is_active"), [leagueId]);
  });

  it("never reads player details when the actor is outside the league", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: false }] } : { rows: [row] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgPlayerCatalogRepository(pool).get(leagueId, playerId, actor))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("JOIN public.players"))).toBe(false);
  });

  it("scopes player details by league, player and active membership", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_member")
      ? { rows: [{ allowed: true }] }
      : sql.includes("JOIN public.players") ? { rows: [row] } : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgPlayerCatalogRepository(pool).get(leagueId, playerId, actor)).resolves.toMatchObject({ id: playerId });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("member.player_id = $2::uuid"), [leagueId, playerId]);
  });
});
