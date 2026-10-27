import { describe, expect, it, vi } from "vitest";
import {
  getRegisteredMergeCandidates,
  getRegistrationHistory,
  type RosterRegistrationRepository,
} from "./get-roster-registration.js";
import type { PlayerCatalogRecord } from "../domain/player-catalog.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const guestId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };
const candidate = {
  id: "00000000-0000-4000-8000-000000000002", name: "Atleta", nickname: null,
  profile_bio: null, avatar_url: null, avatar_alternate_url: null, player_profile: "offensive",
  initial_player_profile: "offensive", profile_decision_source: "initial", profile_source_round_id: null,
  overall_traits: ["offensive"], overall_seed_mode: "observed", is_goalkeeper: false,
  member_category: "player", is_selectable: true, show_fitness_stats: false,
  registration_source: "site_signup", profile_scope: "persistent", created_by_user_id: null,
  created_at: "2026-10-20T10:00:00.000Z", league_player_profile: "offensive",
  league_initial_player_profile: "offensive", league_overall_traits: ["offensive"],
  league_overall_seed_mode: "observed",
} satisfies PlayerCatalogRecord;

function repository(): RosterRegistrationRepository {
  return {
    listHistory: vi.fn().mockResolvedValue([{ id: 1, player_id: guestId, player_name: "Convidado",
      avatar_url: null, member_category: "guest", source: "admin", created_by_user_id: null,
      created_at: "2026-10-20T10:00:00.000Z" }]),
    listMergeCandidates: vi.fn().mockResolvedValue([candidate]),
  };
}

describe("get roster registration", () => {
  it("loads registration history inside the selected league", async () => {
    const target = repository();
    await expect(getRegistrationHistory(leagueId, actor, target)).resolves.toHaveLength(1);
    expect(target.listHistory).toHaveBeenCalledWith(leagueId, actor);
  });

  it("projects merge candidates with their league profile", async () => {
    const target = repository();
    await expect(getRegisteredMergeCandidates(leagueId, guestId, actor, target))
      .resolves.toMatchObject([{ id: candidate.id, player_profile: "offensive" }]);
    expect(target.listMergeCandidates).toHaveBeenCalledWith(leagueId, guestId, actor);
  });
});
