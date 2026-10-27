import { describe, expect, it } from "vitest";
import { isRosterPlayer } from "./player-catalog";

const player = {
  id: "player-1", name: "Jogador", nickname: null, profile_bio: null, avatar_url: null,
  avatar_alternate_url: null, player_profile: "offensive", initial_player_profile: "offensive",
  profile_decision_source: "initial", profile_source_round_id: null, overall_traits: ["offensive"],
  overall_seed_mode: "observed", is_goalkeeper: false, member_category: "player", is_selectable: true,
  is_competitive_profile_complete: false, show_fitness_stats: false, registration_source: "admin",
  profile_scope: "persistent", created_by_user_id: null, created_at: "2026-10-20T10:00:00.000Z",
};

describe("player catalog contract", () => {
  it("accepts the complete player projection", () => expect(isRosterPlayer(player)).toBe(true));
  it("rejects incomplete player data", () => expect(isRosterPlayer({ ...player, member_category: "invalid" })).toBe(false));
});
