import { describe, expect, it } from "vitest";
import { getRoundTeamStats } from "./round-team-stats";

describe("getRoundTeamStats", () => {
  const teams = [
    { id: "a", name: "Time A" },
    { id: "b", name: "Time B" },
    { id: "c", name: "Time C" },
  ];

  it("sums goals from finished and live matches, but wins only from finished matches", () => {
    const stats = getRoundTeamStats(teams, [
      { status: "finished", team_a_id: "a", team_b_id: "b", score_a: 3, score_b: 1 },
      { status: "live", team_a_id: "b", team_b_id: "c", score_a: 2, score_b: 0 },
      { status: "pending", team_a_id: "c", team_b_id: "a", score_a: 0, score_b: 0 },
    ]);

    expect(stats).toEqual([
      expect.objectContaining({ id: "a", wins: 1, goalsFor: 3, goalsAgainst: 1 }),
      expect.objectContaining({ id: "b", wins: 0, goalsFor: 3, goalsAgainst: 3 }),
      expect.objectContaining({ id: "c", wins: 0, goalsFor: 0, goalsAgainst: 2 }),
    ]);
  });

  it("keeps teams with no completed appearance in the summary", () => {
    const stats = getRoundTeamStats(teams, []);
    expect(stats).toHaveLength(3);
    expect(stats[0]).toMatchObject({ id: "a", wins: 0, goalsFor: 0, goalsAgainst: 0 });
  });
});
