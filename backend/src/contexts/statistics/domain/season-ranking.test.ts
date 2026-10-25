import { describe, expect, it } from "vitest";
import { rankingActivePlayerIds, roundRankingPoints } from "../../../../../src/lib/ranking";
import { buildSeasonRankingCore, type RankingRoundRow } from "./season-ranking.js";

function row(playerId: string, roundId: string, rankingPoints: number, extras: Partial<RankingRoundRow> = {}): RankingRoundRow {
  return { playerId, roundId, rankingPoints, points: rankingPoints, games: 1, wins: 0, goals: 0, assists: 0, ...extras };
}

describe("season ranking core", () => {
  it("uses the best six official performances and excludes inactive players", () => {
    const rows = [4, 18, 7, 13, 2, 10, 11].map((points, index) => row("active", `r${index + 1}`, points));
    rows.push(row("inactive", "old", 100));
    rows.push(row("active", "r1", 50, { games: 0 }));
    const ranking = buildSeasonRankingCore(rows, ["r1", "r2", "r3"]);
    expect(ranking).toEqual([{ playerId: "active", points: 63, wins: 0, goals: 0, assists: 0, games: 7 }]);
    expect(rankingActivePlayerIds(["r1", "r2", "r3"], rows.map((r) => ({ player_id: r.playerId, round_id: r.roundId, games: r.games }))))
      .toEqual(new Set(["active"]));
  });

  it("uses ranking_points with legacy fallback and applies existing tie breakers", () => {
    const rows = [
      row("a", "recent", 12.35, { points: 2, wins: 1 }),
      row("b", "recent", 12.35, { wins: 2 }),
      row("c", "recent", 0, { rankingPoints: null, points: 12.35, goals: 1 }),
    ];
    const ranking = buildSeasonRankingCore(rows, ["recent"]);
    expect(ranking.map((entry) => entry.playerId)).toEqual(["b", "a", "c"]);
    expect(ranking[0]?.points).toBe(roundRankingPoints(12.35));
  });
});
