import { describe, expect, it, vi } from "vitest";
import type { PlayerCatalogRecord } from "../domain/player-catalog.js";
import { getPlayersWithStats, getRosterGroups } from "./get-player-statistics.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const actor = { userId: "verified-user" };

function record(id: string, category: PlayerCatalogRecord["member_category"], selectable = true): PlayerCatalogRecord {
  return {
    id, name: id, nickname: null, profile_bio: null, avatar_url: "avatar.jpg", avatar_alternate_url: null,
    player_profile: "offensive", initial_player_profile: "offensive", profile_decision_source: "initial",
    profile_source_round_id: null, overall_traits: ["offensive"], overall_seed_mode: "observed",
    is_goalkeeper: false, member_category: category, is_selectable: selectable, show_fitness_stats: false,
    registration_source: "admin", profile_scope: "persistent", created_by_user_id: null,
    created_at: "2026-10-20T10:00:00.000Z", league_player_profile: "offensive",
    league_initial_player_profile: "offensive", league_overall_traits: ["offensive"],
    league_overall_seed_mode: "observed",
  };
}

describe("player statistics application", () => {
  it("filters the selectable roster and delegates scoped totals", async () => {
    const catalog = {
      list: vi.fn().mockResolvedValue([record("member", "player"), record("inactive", "player", false), record("wag", "wag")]),
      get: vi.fn(),
    };
    const statistics = { listSeasonTotals: vi.fn().mockResolvedValue([]), listLatestOveralls: vi.fn() };
    await expect(getPlayersWithStats(leagueId, "official", true, actor, catalog, statistics))
      .resolves.toMatchObject([{ id: "member", points: 0 }]);
    expect(statistics.listSeasonTotals).toHaveBeenCalledWith(leagueId, "official", actor);
  });

  it("loads OVR only for official roster groups", async () => {
    const catalog = { list: vi.fn().mockResolvedValue([record("member", "player")]), get: vi.fn() };
    const statistics = {
      listSeasonTotals: vi.fn().mockResolvedValue([]),
      listLatestOveralls: vi.fn().mockResolvedValue([{ playerId: "member", overall: 80, defOverall: 80, alaMeiOverall: 80, ataOverall: 80, golOverall: 80 }]),
    };
    await expect(getRosterGroups(leagueId, "official", actor, catalog, statistics))
      .resolves.toMatchObject({ officialPlayers: [{ id: "member", overall: 80 }] });
    await getRosterGroups(leagueId, "friendly", actor, catalog, statistics);
    expect(statistics.listLatestOveralls).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid input before repository access", async () => {
    const catalog = { list: vi.fn(), get: vi.fn() };
    const statistics = { listSeasonTotals: vi.fn(), listLatestOveralls: vi.fn() };
    await expect(getPlayersWithStats(leagueId, "training", false, actor, catalog, statistics)).rejects.toThrow();
    expect(catalog.list).not.toHaveBeenCalled();
  });
});
