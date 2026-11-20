import { describe, expect, it } from "vitest";
import { buildLiveLineupProjections, dashboardEventsFromSnapshots, normalizeLiveMatchSnapshots } from "./live-match-snapshots";
import { LEGACY_FANTASY_SETTINGS } from "@/lib/fantasy/config";

describe("normalizing live match snapshots", () => {
  it("returns the selected matches' goals, assists and own goals for the dashboard", () => {
    const events = dashboardEventsFromSnapshots([
      { id: "m1", match_events: [{ player_id: "a", assist_player_id: "b", is_own_goal: false }, { player_id: "c", assist_player_id: null, is_own_goal: true }] },
      { id: "m2", match_events: [{ player_id: "d", assist_player_id: null, is_own_goal: false }] },
    ], ["m1"]);
    expect(events).toEqual([{ player_id: "a", assist_player_id: "b", is_own_goal: false }, { player_id: "c", assist_player_id: null, is_own_goal: true }]);
    expect(dashboardEventsFromSnapshots([], ["m1"])).toEqual([]);
  });
  it("preserves historical replacement scoring and excludes ineligible replacements from round seven", () => {
    const matches = [{ id: "m1", match_players: [{ player_id: "p1", scoring_eligible: false }], match_events: [{ player_id: "p1" }] }];
    const historical = normalizeLiveMatchSnapshots(matches, 6);
    const current = normalizeLiveMatchSnapshots(matches, 7);
    expect(historical[0]?.match_players[0]?.scoring_eligible).toBe(true);
    expect(current[0]?.match_players[0]?.scoring_eligible).toBe(false);
    expect(current[0]?.match_events).toEqual(matches[0]?.match_events);
  });

  it("projects a goal, goalkeeper and reserve from the API-shaped inputs without counting an ineligible replacement", () => {
    const members = ["scorer", "keeper", "reserve", "replacement", "missing"].map((id) => ({
      player_id: id, player_profile: "offensive", players: { id, member_category: "player", is_selectable: true },
    }));
    const matches = normalizeLiveMatchSnapshots([{
      id: "m1", status: "live", team_a_id: "a", team_b_id: "b", score_a: 1, score_b: 0,
      match_players: [
        { player_id: "scorer", team_id: "a", result_eligible: true, scoring_eligible: true },
        { player_id: "keeper", team_id: "a", result_eligible: true, scoring_eligible: true },
        { player_id: "reserve", team_id: "a", result_eligible: true, scoring_eligible: true },
        { player_id: "replacement", team_id: "b", result_eligible: false, scoring_eligible: false },
      ],
      match_goalkeepers: [{ player_id: "keeper", team_id: "a" }],
      match_events: [{ player_id: "scorer", assist_player_id: "reserve", team_id: "a" }, { player_id: "replacement", team_id: "b" }],
      match_goalkeeper_stints: [],
    }], 7);
    const lineups = [{ id: "l1", user_id: "u1", captain_player_id: "scorer", top_scorer_player_id: "scorer",
      fantasy_lineup_players: [{ player_id: "scorer", slot_role: "ATA" }, { player_id: "keeper", slot_role: "GOL" }, { player_id: "missing", slot_role: "ATA" }],
      fantasy_lineup_reserves: [{ player_id: "reserve", slot_role: "ATA" }], score_breakdown: {} }];
    const result = buildLiveLineupProjections({ matches, lineups, memberships: members, settings: LEGACY_FANTASY_SETTINGS, suppressGoalkeeperRewards: false });
    expect(result.stats.get("scorer")?.goals).toBe(1);
    expect(result.stats.get("keeper")?.goalkeeperGames).toBe(1);
    expect(result.stats.has("replacement")).toBe(false);
    expect(result.projections[0]).toMatchObject({ lineupId: "l1", userId: "u1", reserve: { playerId: "reserve", applied: true, replacedPlayerId: "missing" } });
    expect(result.projections[0]?.captainBonus).toBeGreaterThan(0);
    expect(result.projections[0]?.predictionPoints).toBe(LEGACY_FANTASY_SETTINGS.topScorerPredictionPoints);
  });
});
