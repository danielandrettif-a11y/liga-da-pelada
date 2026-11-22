import { describe, expect, it } from "vitest";
import { buildPlayerCardOverallMap, buildSeasonTeamStandings } from "./season-operations.js";

describe("season operations domain", () => {
  it("normalizes only active finite overall rows", () => {
    const result = buildPlayerCardOverallMap([
      { player_id: "p1", overall: "81", trend: "rising", def_overall: 80, ala_mei_overall: 81, ata_overall: 82, gol_overall: 50 },
      { player_id: "p2", overall: 70 },
    ], new Set(["p1"]));
    expect(result.p1).toMatchObject({ overall: 81, trend: "rising", positions: { DEF: 80, ALA_MEI: 81, ATA: 82, GOL: 50 } });
    expect(result.p2).toBeUndefined();
  });

  it("builds club standings and ignores own-goal leaders", () => {
    const result = buildSeasonTeamStandings([{
      teams: [
        { id: "a", name: "Meia Boca Juniors", crest_url: null },
        { id: "b", name: "MilamB", crest_url: null },
      ],
      matches: [{
        status: "finished", team_a_id: "a", team_b_id: "b", score_a: 2, score_b: 1,
        events: [
          { team_id: "a", is_own_goal: false, player_id: "p1", player_name: "Ana", assist_player_id: "p2", assist_player_name: "Bia" },
          { team_id: "a", is_own_goal: true, player_id: "p3", player_name: "Caio", assist_player_id: null, assist_player_name: null },
        ],
      }],
    }]);
    expect(result[0]).toMatchObject({ name: "Meia Boca Juniors", games: 1, wins: 1, points: 3, goalDifference: 1 });
    expect(result[0]?.topScorer).toMatchObject({ id: "p1", total: 1 });
    expect(result[0]?.topAssister).toMatchObject({ id: "p2", total: 1 });
  });
});
