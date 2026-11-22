import { describe, expect, it, vi } from "vitest";
import { getPlayer, getPlayers, type PlayerCatalogRepository } from "./get-player-catalog.js";
import type { PlayerCatalogRecord } from "../domain/player-catalog.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };
const row = {
  id: playerId, name: "Jogador", nickname: null, profile_bio: null, avatar_url: null,
  avatar_alternate_url: null, player_profile: "offensive", initial_player_profile: "offensive",
  profile_decision_source: "initial", profile_source_round_id: null, overall_traits: ["offensive"],
  overall_seed_mode: "observed", is_goalkeeper: false, member_category: "player", is_selectable: true,
  show_fitness_stats: false, registration_source: "admin", profile_scope: "persistent",
  created_by_user_id: null, created_at: "2026-10-20T10:00:00.000Z", league_player_profile: "offensive",
  league_initial_player_profile: "offensive", league_overall_traits: ["offensive"],
  league_overall_seed_mode: "observed",
} satisfies PlayerCatalogRecord;

function repository(): PlayerCatalogRepository {
  return { list: vi.fn().mockResolvedValue([row]), get: vi.fn().mockResolvedValue(row) };
}

describe("get player catalog", () => {
  it("normalizes scope before listing and applies selectable filtering", async () => {
    const target = repository();
    await expect(getPlayers(leagueId.toUpperCase(), true, actor, target)).resolves.toHaveLength(1);
    expect(target.list).toHaveBeenCalledWith(leagueId, actor);
  });

  it("scopes player detail to the requested league", async () => {
    const target = repository();
    await expect(getPlayer(leagueId, playerId, actor, target)).resolves.toMatchObject({ id: playerId });
    expect(target.get).toHaveBeenCalledWith(leagueId, playerId, actor);
  });

  it("rejects invalid identifiers before persistence", async () => {
    const target = repository();
    await expect(getPlayer(leagueId, "invalid", actor, target)).rejects.toThrow("Jogador inválido");
    expect(target.get).not.toHaveBeenCalled();
  });
});
