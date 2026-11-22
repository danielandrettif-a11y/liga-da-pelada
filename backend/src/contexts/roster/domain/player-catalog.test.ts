import { describe, expect, it } from "vitest";
import { orderedPlayers, playerFromCatalogRecord, type PlayerCatalogRecord } from "./player-catalog.js";

function record(overrides: Partial<PlayerCatalogRecord> = {}): PlayerCatalogRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Álvaro",
    nickname: null,
    profile_bio: null,
    avatar_url: "https://example.test/avatar.webp",
    avatar_alternate_url: null,
    player_profile: "midfield",
    initial_player_profile: "midfield",
    profile_decision_source: "initial",
    profile_source_round_id: null,
    overall_traits: ["offensive"],
    overall_seed_mode: "observed",
    is_goalkeeper: false,
    member_category: "player",
    is_selectable: true,
    show_fitness_stats: false,
    registration_source: "admin",
    profile_scope: "persistent",
    created_by_user_id: null,
    created_at: "2026-10-20T10:00:00.000Z",
    league_player_profile: "defensive",
    league_initial_player_profile: "offensive",
    league_overall_traits: ["defensive", "offensive"],
    league_overall_seed_mode: "legacy_tag",
    ...overrides,
  };
}

describe("player catalog domain", () => {
  it("projects the league-specific competitive profile over the global identity", () => {
    expect(playerFromCatalogRecord(record())).toMatchObject({
      name: "Álvaro",
      player_profile: "defensive",
      initial_player_profile: "offensive",
      overall_traits: ["defensive", "offensive"],
      overall_seed_mode: "legacy_tag",
      is_competitive_profile_complete: true,
    });
  });

  it("filters selectable athletes and keeps the Portuguese name order", () => {
    const players = orderedPlayers([
      record({ id: "2", name: "Zeca" }),
      record({ id: "1", name: "Álvaro" }),
      record({ id: "3", name: "Torcida", member_category: "supporter", is_selectable: false }),
    ], true);
    expect(players.map((player) => player.name)).toEqual(["Álvaro", "Zeca"]);
  });
});
