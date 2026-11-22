import { describe, expect, it } from "vitest";
import { buildRoundStatistics, calculateRoundStatRows, type RoundCalculationContext } from "./round-statistics.js";

const playerA = "11111111-1111-4111-8111-111111111111";
const playerB = "22222222-2222-4222-8222-222222222222";
const roundId = "33333333-3333-4333-8333-333333333333";
const leagueId = "44444444-4444-4444-8444-444444444444";

function context(roundType = "official"): RoundCalculationContext {
  return {
    round: {
      id: roundId, league_id: leagueId, date: "2026-10-30", created_at: "2026-10-30T10:00:00Z",
      number: 20, status: "finished", round_type: roundType, suppress_goalkeeper_rewards: false,
      scoring_version: 14,
      scoring_snapshot: { version: 14, goal: 4, assist: 2.5, ownGoal: -3, goalkeeperAppearance: 1,
        goalkeeperGoalConceded: -0.5, defenderGoal: 5, defenderAssist: 3, defenderCleanSheet: 3,
        defenderOneGoal: 1, defenderOneGoalConceded: -0.75, defenderTwoGoalsConceded: -1.75,
        teamGoalConceded: -0.5, goalkeeperCleanSheet: 4, goalkeeperOneGoal: 2 },
      round_players: [playerA, playerB].map((player_id) => ({
        player_id, player_profile_locked: player_id === playerA ? "offensive" : "defensive",
        profile_decision_source: "initial", profile_appearance_number: 1,
        profile_def_overall: 70, profile_ata_overall: 70,
      })),
      matches: [{
        id: "55555555-5555-4555-8555-555555555555", status: "finished",
        team_a_id: "66666666-6666-4666-8666-666666666666",
        team_b_id: "77777777-7777-4777-8777-777777777777",
        score_a: 1, score_b: 0, duration_seconds: 420, timer_accumulated_seconds: 420,
        eligibility_elapsed_offset_seconds: 0,
        match_players: [
          { player_id: playerA, team_id: "66666666-6666-4666-8666-666666666666", result_eligible: true, scoring_eligible: true },
          { player_id: playerB, team_id: "77777777-7777-4777-8777-777777777777", result_eligible: true, scoring_eligible: true },
        ],
        match_goalkeepers: [{ player_id: playerB, team_id: "77777777-7777-4777-8777-777777777777" }],
        match_goalkeeper_stints: [],
        match_events: [{
          event_type: "goal", player_id: playerA, assist_player_id: null,
          team_id: "66666666-6666-4666-8666-666666666666",
          goalkeeper_a_player_id: null, goalkeeper_b_player_id: playerB, is_own_goal: false,
        }],
      }],
    },
    players: [
      { id: playerA, name: "Atacante", avatar_url: "/a.png", member_category: "player", is_selectable: true,
        player_profile: "offensive", overall_traits: ["offensive"], is_competitive_profile_complete: true },
      { id: playerB, name: "Defensor", avatar_url: "/b.png", member_category: "player", is_selectable: true,
        player_profile: "defensive", overall_traits: ["defensive"], is_competitive_profile_complete: true },
    ],
    frozenRoleWeights: new Map(), playersWithPriorOfficialRound: new Set(), overallPositions: new Map(),
    voidedPlayerIds: new Set(),
  };
}

describe("round statistics domain", () => {
  it("consolidates result, goal and goalkeeper timeline using the frozen scoring snapshot", () => {
    const rows = calculateRoundStatRows(context());
    const attacker = rows.find((row) => row.player_id === playerA)!;
    const goalkeeper = rows.find((row) => row.player_id === playerB)!;

    expect(attacker).toMatchObject({ games: 1, wins: 1, goals: 1, points: 4 });
    expect(goalkeeper).toMatchObject({ games: 1, losses: 1, goalkeeper_games: 1, goals_conceded: 1 });
    expect(goalkeeper.points).toBe(2.5);
  });

  it("keeps friendly scouts but assigns zero ranking points", () => {
    const rows = calculateRoundStatRows(context("friendly"));
    expect(rows.find((row) => row.player_id === playerA)).toMatchObject({ goals: 1, points: 0 });
  });

  it("does not count a voided player", () => {
    const input = context();
    input.voidedPlayerIds.add(playerA);
    const attacker = calculateRoundStatRows(input).find((row) => row.player_id === playerA)!;
    expect(attacker).toMatchObject({ games: 0, goals: 0, points: 0 });
  });

  it("builds round leaders and ignores zero-game registration rows", () => {
    const result = buildRoundStatistics({
      roundId, roundType: "official", bestGoalkeeperPlayerId: playerB,
      rows: [
        { player: { id: playerA, name: "Zeta" }, games: 1, wins: 1, draws: 0, losses: 0, goals: 1, assists: 0, points: 7 },
        { player: { id: playerB, name: "Alfa" }, games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, points: 0 },
      ],
    });
    expect(result.entries).toHaveLength(1);
    expect(result.highlights.scorers[0].player.id).toBe(playerA);
    expect(result.highlights.goalkeepers).toEqual([]);
  });
});
