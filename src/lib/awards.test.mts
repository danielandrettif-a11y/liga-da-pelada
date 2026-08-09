import assert from "node:assert/strict";

const { buildAwardSeasonsByPlayer, countAwards } = await import(new URL("./awards.ts", import.meta.url).href);

const seasons = buildAwardSeasonsByPlayer(
  [
    { id: "old", number: 4, date: "2026-07-01", seasonId: "s1", seasonNumber: 1, seasonStatus: "finished", bestGoalkeeperPlayerId: null },
    { id: "now", number: 1, date: "2026-08-01", seasonId: "s2", seasonNumber: 2, seasonStatus: "active", bestGoalkeeperPlayerId: "p1" },
  ],
  [
    { player_id: "p1", round_id: "old", goals: 2, assists: 0 },
    { player_id: "p2", round_id: "old", goals: 1, assists: 1 },
    { player_id: "p1", round_id: "now", goals: 1, assists: 2 },
    { player_id: "p2", round_id: "now", goals: 1, assists: 0 },
  ],
).get("p1")!;

assert.deepEqual(seasons.map((season: { seasonNumber: number }) => season.seasonNumber), [2, 1]);
assert.deepEqual(countAwards(seasons, "active"), { topScorer: 1, topAssister: 1, bestGoalkeeper: 1 });
assert.equal(seasons[1].awards[0].roundId, "old");
