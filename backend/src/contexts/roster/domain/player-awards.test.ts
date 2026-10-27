import { describe, expect, it } from "vitest";
import {
  achievementBeltsFromJson, monthlyAwardWinnersFromRows, monthlyAwardsFromRows, parseAwardPeriod,
} from "./player-awards.js";

describe("player awards", () => {
  it("maps database monthly awards to the public contract", () => {
    expect(monthlyAwardsFromRows([{ award_type: "goldenBootMonth", period_start: "2026-09-01",
      points: "8.5", rounds_played: 4, metric_value: 6, is_final: true }])).toEqual([{
      type: "goldenBootMonth", periodStart: "2026-09-01", points: 8.5, roundsPlayed: 4,
      metricValue: 6, isFinal: true,
    }]);
    expect(monthlyAwardWinnersFromRows([{ award_type: "topAssistMonth", period_start: "2026-09-01",
      points: 7, rounds_played: 3, is_final: true, player_id: "player-1", player_name: "Ana",
      avatar_url: null }])).toMatchObject([{ playerId: "player-1", playerName: "Ana", avatarUrl: null }]);
  });

  it("normalizes achievement belt payloads", () => {
    expect(achievementBeltsFromJson([{ slug: "top_scorer", name: "Artilheiro", description: "Recorde",
      recordValue: 4, unit: "gols", scope: "player", roundId: "round-1", roundNumber: 2,
      roundDate: "2026-09-02", team: null }])).toMatchObject([{ slug: "top_scorer", recordValue: 4 }]);
  });

  it("accepts only real month starts", () => {
    expect(parseAwardPeriod("2026-09-01")).toBe("2026-09-01");
    expect(() => parseAwardPeriod("2026-02-31")).toThrow("Período mensal inválido");
  });
});
