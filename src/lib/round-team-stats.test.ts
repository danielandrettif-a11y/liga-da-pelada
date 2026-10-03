import { describe, expect, it } from "vitest";
import { getRoundTeamStats } from "./round-team-stats";

describe("getRoundTeamStats", () => {
  const teams = [
    { id: "a", name: "Time A" },
    { id: "b", name: "Time B" },
    { id: "c", name: "Time C" },
  ];

  it("sums live goals, but only counts finished results", () => {
    const stats = getRoundTeamStats(teams, [
      { status: "finished", team_a_id: "a", team_b_id: "b", score_a: 3, score_b: 1, match_events: [
        { team_id: "a", assist_player_id: "p1" },
        { team_id: "b", assist_player_id: "p2" },
      ] },
      { status: "live", team_a_id: "b", team_b_id: "c", score_a: 2, score_b: 0, match_events: [
        { team_id: "b", assist_player_id: "p3" },
      ] },
      { status: "finished", team_a_id: "a", team_b_id: "c", score_a: 2, score_b: 2, match_events: [
        { team_id: "a", assist_player_id: "p4" },
        { team_id: "c", assist_player_id: "p5" },
      ] },
      { status: "pending", team_a_id: "c", team_b_id: "a", score_a: 0, score_b: 0 },
    ]);

    expect(stats).toEqual([
      expect.objectContaining({ id: "a", wins: 1, draws: 1, losses: 0, goalsFor: 5, assists: 2, points: 29 }),
      expect.objectContaining({ id: "b", wins: 0, draws: 0, losses: 1, goalsFor: 3, assists: 2, points: 14.5 }),
      expect.objectContaining({ id: "c", wins: 0, draws: 1, losses: 0, goalsFor: 2, assists: 1, points: 11.5 }),
    ]);
  });

  it("keeps teams with no completed appearance in the summary", () => {
    const stats = getRoundTeamStats(teams, []);
    expect(stats).toHaveLength(3);
    expect(stats[0]).toMatchObject({ id: "a", wins: 0, draws: 0, losses: 0, points: 0, goalsFor: 0, goalsAgainst: 0, assists: 0 });
  });
});
