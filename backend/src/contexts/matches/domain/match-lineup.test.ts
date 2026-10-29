import { describe, expect, it } from "vitest";
import { MatchLineupError, prepareMatchLineup, type MatchLineupSnapshot } from "./match-lineup.js";

const teamA = "00000000-0000-4000-8000-000000000001";
const teamB = "00000000-0000-4000-8000-000000000002";
const teamC = "00000000-0000-4000-8000-000000000003";
const playerA = "00000000-0000-4000-8000-000000000004";
const playerB = "00000000-0000-4000-8000-000000000005";
const lender = "00000000-0000-4000-8000-000000000006";

function snapshot(): MatchLineupSnapshot {
  return {
    roundNumber: 8,
    roundStatus: "active",
    formationMode: "balanced",
    arrivalOrderEnabled: false,
    targetPlayersPerTeam: 1,
    previousMatchCount: 1,
    teams: [
      { id: teamA, name: "Time A", position: 1, fixedGoalkeeperPlayerId: null,
        players: [{ playerId: playerA, goalkeeperOrder: 1, loanOrder: 1 }] },
      { id: teamB, name: "Time B", position: 2, fixedGoalkeeperPlayerId: null,
        players: [{ playerId: playerB, goalkeeperOrder: 1, loanOrder: 1 }] },
      { id: teamC, name: "Time C", position: 3, fixedGoalkeeperPlayerId: null,
        players: [{ playerId: lender, goalkeeperOrder: 1, loanOrder: 1 }] },
    ],
    roundPlayers: [playerA, playerB, lender].map((playerId) => ({
      playerId, availabilityStatus: "available", attendanceStatus: "present",
    })),
    previousLoanCount: new Map(),
  };
}

describe("prepareMatchLineup", () => {
  it("builds a complete roster lineup and goalkeeper rotation", () => {
    const result = prepareMatchLineup({
      round_id: "round", team_a_id: teamA, team_b_id: teamB,
      goalkeeper_a_id: playerA, goalkeeper_b_id: playerB,
    }, snapshot());

    expect(result.lineup).toHaveLength(2);
    expect(result.lineup.every((entry) => entry.participation_kind === "roster")).toBe(true);
    expect(result.goalkeeperARotationOrder).toBe(1);
  });

  it("uses the fair structural-loan slot when a selected team is underfilled", () => {
    const state = snapshot();
    state.targetPlayersPerTeam = 2;
    const secondLender = "00000000-0000-4000-8000-000000000007";
    state.teams[2]!.players.push({ playerId: secondLender, goalkeeperOrder: 2, loanOrder: 2 });
    state.roundPlayers.push({ playerId: secondLender, availabilityStatus: "available", attendanceStatus: "present" });

    const result = prepareMatchLineup({
      round_id: "round", team_a_id: teamA, team_b_id: teamB,
      goalkeeper_a_id: lender, goalkeeper_b_id: playerB,
      structural_loan_overrides: [{ target_team_id: teamA, rotation_order: 1, player_id: lender }],
    }, state);

    expect(result.lineup).toContainEqual(expect.objectContaining({
      player_id: lender, team_id: teamA, original_team_id: teamC, participation_kind: "structural",
    }));
    expect(result.goalkeeperARotationOrder).toBe(1);
  });

  it("rejects a finished round", () => {
    const state = snapshot();
    state.roundStatus = "finished";
    expect(() => prepareMatchLineup({
      round_id: "round", team_a_id: teamA, team_b_id: teamB,
      goalkeeper_a_id: playerA, goalkeeper_b_id: playerB,
    }, state)).toThrow(MatchLineupError);
  });
});
