import { describe, expect, it } from "vitest";
import { LEGACY_FANTASY_SETTINGS as DEFAULT_FANTASY_SETTINGS } from "./config";
import { calculateFantasyGoalkeeperSlotPoints } from "./engine";
import { buildFantasyGoalkeeperSimulationStats } from "./goalkeeper-simulation";
import { calculatePositionBreakdown } from "./position-breakdown";

describe("simulação histórica da vaga GOL", () => {
  it("reconstrói empate e clean sheet sem usar os scouts feitos na linha", () => {
    const stats = buildFantasyGoalkeeperSimulationStats([{
      status: "finished",
      teamAId: "a",
      teamBId: "b",
      scoreA: 0,
      scoreB: 0,
      players: [{ playerId: "daniel", scoringEligible: true }],
      goalkeepers: [{ playerId: "daniel", teamId: "b" }],
      events: [],
    }], "daniel");

    expect(stats).toEqual({
      goalkeeperGames: 1,
      goalkeeperGoals: 0,
      goalkeeperAssists: 0,
      goalkeeperOwnGoals: 0,
      goalkeeperWins: 0,
      goalkeeperDraws: 1,
      goalkeeperLosses: 0,
      goalsConceded: 0,
      cleanSheets: 1,
    });
    const basePoints = calculateFantasyGoalkeeperSlotPoints(stats, DEFAULT_FANTASY_SETTINGS);
    const positionBonus = calculatePositionBreakdown({
      slotRole: "GOL",
      playerProfile: "midfield",
      goals: 4,
      assists: 2,
      draws: 2,
      defensiveCleanGames: 0,
      defensiveOneGoalGames: 0,
      goalkeeperGames: stats.goalkeeperGames,
      cleanSheets: stats.cleanSheets,
      goalkeeperCleanSheetPoints: DEFAULT_FANTASY_SETTINGS.goalkeeperSlotCleanSheetPoints,
      scoringVersion: DEFAULT_FANTASY_SETTINGS.scoringVersion,
    }).appliedBonus;

    expect(basePoints).toBe(5);
    expect(basePoints + positionBonus).toBe(9);
  });

  it("ignora uma atuação sem direito a pontuar", () => {
    const stats = buildFantasyGoalkeeperSimulationStats([{
      status: "finished",
      teamAId: "a",
      teamBId: "b",
      scoreA: 1,
      scoreB: 0,
      players: [{ playerId: "substituto", scoringEligible: false }],
      goalkeepers: [{ playerId: "substituto", teamId: "a" }],
      events: [],
    }], "substituto");

    expect(stats.goalkeeperGames).toBe(0);
  });
});
