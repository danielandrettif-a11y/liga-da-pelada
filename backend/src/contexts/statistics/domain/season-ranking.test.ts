import { describe, expect, it } from "vitest";
import {
  buildSeasonRankingCore,
  aggregateRankingRows,
  rankingActivePlayerIds,
  roundRankingPoints,
  buildAwardSeasonsByPlayer,
  countAwards,
  sortRankingEntries,
  type RankingRoundRow,
  type RankingDetailStatsRow,
  type OfficialRoundMeta,
  type VisibleSeasonMeta,
} from "./season-ranking.js";

function row(playerId: string, roundId: string, rankingPoints: number, extras: Partial<RankingRoundRow> = {}): RankingRoundRow {
  return { playerId, roundId, rankingPoints, points: rankingPoints, games: 1, wins: 0, goals: 0, assists: 0, ...extras };
}

function detailRow(
  playerId: string,
  roundId: string,
  rankingPoints: number,
  extras: Partial<RankingDetailStatsRow> = {},
): RankingDetailStatsRow {
  return {
    player_id: playerId,
    round_id: roundId,
    games: 1,
    wins: 1,
    draws: 0,
    losses: 0,
    goals: 2,
    assists: 1,
    points: rankingPoints,
    ranking_points: rankingPoints,
    goalkeeper_games: 0,
    goalkeeper_goals: 0,
    goalkeeper_assists: 0,
    goalkeeper_own_goals: 0,
    goals_conceded: 0,
    clean_sheets: 0,
    own_goals: 0,
    defensive_clean_games: 0,
    defensive_one_goal_games: 0,
    team_goals_conceded: 0,
    ranking_defensive_clean_games: 0,
    ranking_defensive_one_goal_games: 0,
    ranking_role_weights: [{ role: "ATA", overall: 80, weight: 1 }],
    ranking_position_bonus: 0,
    player_profile_locked: "offensive",
    profile_decision_source: "overall",
    profile_appearance_number: 1,
    profile_def_overall: 60,
    profile_ata_overall: 80,
    player: {
      id: playerId,
      name: `Player ${playerId}`,
      is_selectable: true,
      member_category: "player",
      is_competitive_profile_complete: true,
    },
    ...extras,
  };
}

describe("season ranking domain", () => {
  it("buildSeasonRankingCore uses the best six official performances and excludes inactive players", () => {
    const rows = [4, 18, 7, 13, 2, 10, 11].map((points, index) => row("active", `r${index + 1}`, points));
    rows.push(row("inactive", "old", 100));
    rows.push(row("active", "r1", 50, { games: 0 }));
    const ranking = buildSeasonRankingCore(rows, ["r1", "r2", "r3"]);
    expect(ranking).toEqual([{ playerId: "active", points: 63, wins: 0, goals: 0, assists: 0, games: 7 }]);
    expect(rankingActivePlayerIds(["r1", "r2", "r3"], rows.map((r) => ({ player_id: r.playerId, round_id: r.roundId, games: r.games }))))
      .toEqual(new Set(["active"]));
  });

  it("buildSeasonRankingCore uses ranking_points with legacy fallback and applies tie breakers", () => {
    const rows = [
      row("a", "recent", 12.35, { points: 2, wins: 1 }),
      row("b", "recent", 12.35, { wins: 2 }),
      row("c", "recent", 0, { rankingPoints: null, points: 12.35, goals: 1 }),
    ];
    const ranking = buildSeasonRankingCore(rows, ["recent"]);
    expect(ranking.map((entry) => entry.playerId)).toEqual(["b", "a", "c"]);
    expect(ranking[0]?.points).toBe(roundRankingPoints(12.35));
  });

  it("aggregateRankingRows groups player stats, picks best 6 rounds, and calculates metrics", () => {
    const rows: RankingDetailStatsRow[] = [
      detailRow("p1", "r1", 10, { goals: 2, wins: 1 }),
      detailRow("p1", "r2", 15, { goals: 3, wins: 1 }),
      detailRow("p1", "r3", 5, { goals: 1, wins: 0, draws: 1 }),
      detailRow("p1", "r4", 0, { games: 0 }), // jogo zerado não entra
    ];

    const roundsMap = new Map<string, OfficialRoundMeta>([
      ["r1", { id: "r1", number: 1, date: "2026-01-01" }],
      ["r2", { id: "r2", number: 2, date: "2026-01-08" }],
      ["r3", { id: "r3", number: 3, date: "2026-01-15" }],
    ]);

    const aggregated = aggregateRankingRows(rows, roundsMap, 6);
    expect(aggregated).toHaveLength(1);
    const p1 = aggregated[0];
    expect(p1.player.id).toBe("p1");
    expect(p1.games).toBe(3);
    expect(p1.wins).toBe(2);
    expect(p1.draws).toBe(1);
    expect(p1.goals).toBe(6);
    expect(p1.points).toBe(30); // 10 + 15 + 5
    expect(p1.bestRounds).toHaveLength(3);
    expect(p1.bestRounds?.[0].points).toBe(15);
  });

  it("buildAwardSeasonsByPlayer computes round awards correctly", () => {
    const rounds: OfficialRoundMeta[] = [
      { id: "r1", number: 1, date: "2026-01-01", seasonId: "s1" },
    ];
    const stats: RankingDetailStatsRow[] = [
      detailRow("p1", "r1", 20, { goals: 4, assists: 1, wins: 1 }),
      detailRow("p2", "r1", 10, { goals: 1, assists: 3, wins: 1 }),
    ];
    const visibleSeasonsMap = new Map<string, VisibleSeasonMeta>([
      ["s1", { id: "s1", number: 1, status: "active" }],
    ]);

    const awardsByPlayer = buildAwardSeasonsByPlayer(rounds, stats, visibleSeasonsMap);
    const p1Awards = awardsByPlayer.get("p1")?.[0]?.awards || [];
    const p2Awards = awardsByPlayer.get("p2")?.[0]?.awards || [];

    expect(p1Awards.some((a) => a.type === "roundMvp")).toBe(true);
    expect(p1Awards.some((a) => a.type === "topScorer")).toBe(true);
    expect(p2Awards.some((a) => a.type === "topAssister")).toBe(true);

    const counts = countAwards(awardsByPlayer.get("p1") || []);
    expect(counts.roundMvp).toBe(1);
    expect(counts.topScorer).toBe(1);
  });

  it("sortRankingEntries orders by points, wins, goals, assists", () => {
    const list = [
      { player: { id: "1" }, points: 10, wins: 2, goals: 1, assists: 1 },
      { player: { id: "2" }, points: 10, wins: 3, goals: 0, assists: 0 },
      { player: { id: "3" }, points: 15, wins: 1, goals: 5, assists: 0 },
      { player: { id: "4" }, points: 10, wins: 2, goals: 2, assists: 0 },
    ];
    const sorted = sortRankingEntries(list as any);
    expect(sorted.map((item) => (item as any).player.id)).toEqual(["3", "2", "4", "1"]);
  });
});
