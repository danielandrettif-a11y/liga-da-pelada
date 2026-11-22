import { describe, expect, it } from "vitest";
import { parseLeagueName, parseLeagueSettings } from "./league-settings.js";

describe("league settings domain", () => {
  it("normalizes names and optional venue values", () => {
    expect(parseLeagueName("  Pelada   BQ  ")).toBe("Pelada BQ");
    expect(parseLeagueSettings({
      match_duration: 7, players_per_team: 5, teams_per_round: 3,
      stadium_name: "  ", stadium_map_url: "", event_duration_minutes: 120,
    })).toEqual({
      matchDuration: 7, playersPerTeam: 5, teamsPerRound: 3,
      stadiumName: null, stadiumMapUrl: null, eventDurationMinutes: 120,
    });
  });

  it("rejects invalid ranges and unsafe map URLs", () => {
    expect(() => parseLeagueName("BQ")).toThrow("3 e 80");
    expect(() => parseLeagueSettings({
      match_duration: 0, players_per_team: 5, teams_per_round: 3,
      stadium_name: "", stadium_map_url: "", event_duration_minutes: 120,
    })).toThrow("1 e 90");
    expect(() => parseLeagueSettings({
      match_duration: 7, players_per_team: 5, teams_per_round: 3,
      stadium_name: "", stadium_map_url: "javascript:alert(1)", event_duration_minutes: 120,
    })).toThrow("http://");
  });
});
