import { describe, expect, it } from "vitest";
import { buildSeasonTeamStandings } from "./season-team-standings";

describe("buildSeasonTeamStandings", () => {
  it("builds a four-club league table with football scoring and leaders", () => {
    const standings = buildSeasonTeamStandings([{ 
      teams: [
        { id: "a", name: "MilamB", crest_url: "/team-crests/milamb.png" },
        { id: "b", name: "Inter de Meião", crest_url: "/team-crests/inter-de-meiao.png" },
      ],
      matches: [{
        status: "finished",
        team_a_id: "a",
        team_b_id: "b",
        score_a: 2,
        score_b: 1,
        match_events: [
          { team_id: "a", player_id: "p1", player: { id: "p1", name: "Daniel" }, assist_player_id: "p2", assist_player: { id: "p2", name: "Matheus" } },
          { team_id: "a", player_id: "p1", player: { id: "p1", name: "Daniel" } },
          { team_id: "b", player_id: "p3", player: { id: "p3", name: "João" } },
        ],
      }],
    }]);

    expect(standings).toHaveLength(4);
    expect(standings[0]).toMatchObject({ name: "MilamB", games: 1, wins: 1, points: 3, goalsFor: 2, goalsAgainst: 1 });
    expect(standings[0].topScorer).toMatchObject({ name: "Daniel", total: 2 });
    expect(standings[0].topAssister).toMatchObject({ name: "Matheus", total: 1 });
  });

  it("awards one point for a draw and ignores unfinished matches", () => {
    const standings = buildSeasonTeamStandings([{
      teams: [
        { id: "a", name: "Meia Boca Juniors", crest_url: "/team-crests/meia-boca-juniors.png" },
        { id: "b", name: "Patético de Madrid", crest_url: "/team-crests/patetico-de-madrid.png" },
      ],
      matches: [
        { status: "finished", team_a_id: "a", team_b_id: "b", score_a: 1, score_b: 1 },
        { status: "live", team_a_id: "a", team_b_id: "b", score_a: 4, score_b: 0 },
      ],
    }]);

    expect(standings.find((team) => team.name === "Meia Boca Juniors")).toMatchObject({ games: 1, draws: 1, points: 1 });
    expect(standings.find((team) => team.name === "Patético de Madrid")).toMatchObject({ games: 1, draws: 1, points: 1 });
  });
});
