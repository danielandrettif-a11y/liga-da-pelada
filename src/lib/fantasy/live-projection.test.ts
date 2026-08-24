import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS } from "./config";
import { projectFantasyLiveLineups, projectFantasyLiveStats } from "./live-projection";

describe("live fantasy projection", () => {
  const baseMatch = {
    id: "match-1",
    teamAId: "a",
    teamBId: "b",
    scoreA: 1,
    scoreB: 0,
    players: [
      { playerId: "scorer", teamId: "a", resultEligible: true },
      { playerId: "keeper", teamId: "a", resultEligible: true },
      { playerId: "loser", teamId: "b", resultEligible: true },
    ],
    goalkeepers: [{ playerId: "keeper", teamId: "a" }],
    events: [{ playerId: "scorer", assistPlayerId: "keeper", teamId: "a" }],
  } as const;

  it("mostra gol e assistência imediatamente, sem resultado antes do fim", () => {
    const projected = projectFantasyLiveStats([{ ...baseMatch, status: "live" }], DEFAULT_FANTASY_SETTINGS);
    expect(projected.get("scorer")?.goals).toBe(1);
    expect(projected.get("scorer")?.wins).toBe(0);
    expect(projected.get("keeper")?.assists).toBe(1);
    expect(projected.get("keeper")?.goalkeeperGames).toBe(1);
  });

  it("inclui resultado somente depois de encerrar", () => {
    const projected = projectFantasyLiveStats([{ ...baseMatch, status: "finished" }], DEFAULT_FANTASY_SETTINGS);
    expect(projected.get("scorer")?.wins).toBe(1);
    expect(projected.get("loser")?.losses).toBe(1);
  });

  it("atualiza a projeção quando o evento deixa de existir", () => {
    const withGoal = projectFantasyLiveStats([{ ...baseMatch, status: "live" }], DEFAULT_FANTASY_SETTINGS);
    const withoutGoal = projectFantasyLiveStats([{ ...baseMatch, status: "live", scoreA: 0, events: [] }], DEFAULT_FANTASY_SETTINGS);
    expect(withGoal.get("scorer")!.basePoints).toBeGreaterThan(withoutGoal.get("scorer")?.basePoints || 0);
  });

  it("separa gol contra de gol marcado e aplica a penalidade", () => {
    const stats = projectFantasyLiveStats([
      {
        ...baseMatch,
        status: "live",
        scoreA: 0,
        events: [{ playerId: "scorer", teamId: "a", isOwnGoal: true }],
      },
    ], DEFAULT_FANTASY_SETTINGS);

    expect(stats.get("scorer")).toMatchObject({ goals: 0, ownGoals: 1, basePoints: -3 });
  });

  it("aplica capitão e palpites como prévia", () => {
    const stats = projectFantasyLiveStats([{ ...baseMatch, status: "live" }], DEFAULT_FANTASY_SETTINGS);
    const [lineup] = projectFantasyLiveLineups([
      { id: "lineup", userId: "user", playerIds: ["scorer", "keeper"], captainPlayerId: "scorer", topScorerPlayerId: "scorer", topAssistPlayerId: "keeper" },
    ], stats, DEFAULT_FANTASY_SETTINGS);
    expect(lineup.captainBonus).toBe(
      stats.get("scorer")!.basePoints * (DEFAULT_FANTASY_SETTINGS.captainMultiplier - 1)
    );
    expect(lineup.predictionPoints).toBe(DEFAULT_FANTASY_SETTINGS.topScorerPredictionPoints + DEFAULT_FANTASY_SETTINGS.topAssistPredictionPoints);
  });
});
