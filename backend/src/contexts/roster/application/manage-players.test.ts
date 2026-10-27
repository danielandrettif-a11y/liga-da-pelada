import { describe, expect, it, vi } from "vitest";
import { createPlayer, importGuestRoster, swapPlayerAvatars, updatePlayer } from "./manage-players.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };
const record = {
  id: playerId, name: "Convidado", nickname: null, profile_bio: null, avatar_url: null,
  avatar_alternate_url: null, player_profile: "offensive" as const, initial_player_profile: "offensive" as const,
  profile_decision_source: "initial" as const, profile_source_round_id: null, overall_traits: ["offensive" as const],
  overall_seed_mode: "observed" as const, is_goalkeeper: false, member_category: "guest" as const,
  is_selectable: true, show_fitness_stats: false, registration_source: "admin" as const,
  profile_scope: "persistent" as const, created_by_user_id: null, created_at: "2026-10-20T10:00:00.000Z",
  league_player_profile: "offensive" as const, league_initial_player_profile: "offensive" as const,
  league_overall_traits: ["offensive" as const], league_overall_seed_mode: "observed" as const,
};

function repository() {
  return {
    create: vi.fn().mockResolvedValue(record), update: vi.fn().mockResolvedValue(record),
    swapAvatars: vi.fn().mockResolvedValue(undefined), importGuests: vi.fn().mockResolvedValue([]),
  };
}

describe("player management use cases", () => {
  it("creates and updates league-scoped players through normalized commands", async () => {
    const target = repository();
    await expect(createPlayer(
      leagueId, { name: " Convidado ", member_category: "guest" }, actor, target,
    )).resolves.toMatchObject({ id: playerId, name: "Convidado" });
    await expect(updatePlayer(
      leagueId, playerId, { nickname: " BQ " }, actor, target,
    )).resolves.toMatchObject({ id: playerId });
    expect(target.create).toHaveBeenCalledWith(leagueId, expect.objectContaining({ name: "Convidado" }), actor);
    expect(target.update).toHaveBeenCalledWith(
      leagueId, playerId, expect.objectContaining({ nickname: "BQ" }), actor,
    );
  });

  it("delegates avatar swaps and guest imports with validated identifiers", async () => {
    const target = repository();
    await swapPlayerAvatars(leagueId, playerId, actor, target);
    await importGuestRoster(leagueId, [" Ana  BQ "], actor, target);
    expect(target.swapAvatars).toHaveBeenCalledWith(leagueId, playerId, actor);
    expect(target.importGuests).toHaveBeenCalledWith(leagueId, ["Ana BQ"], actor);
  });

  it("rejects malformed input before touching persistence", async () => {
    const target = repository();
    await expect(createPlayer(leagueId, { name: "Ana", member_category: "player" }, actor, target))
      .rejects.toThrow("precisam criar o próprio perfil");
    expect(target.create).not.toHaveBeenCalled();
  });
});
