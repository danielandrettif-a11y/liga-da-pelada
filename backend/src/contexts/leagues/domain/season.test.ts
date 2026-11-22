import { describe, expect, it } from "vitest";
import { buildSeasonSummary, parseRoundType, type SeasonSummaryContext } from "./season.js";

const base: SeasonSummaryContext = {
  leagueName: "Pelada BQ",
  season: { id: "season-1", number: 2, started_at: "2026-01-01T00:00:00.000Z" },
  rounds: [{ id: "round-1", status: "finished", roundType: "official" }],
  matches: [{ status: "finished", eventCount: 3 }],
  participantIds: ["player-1", "player-2", "player-1"],
  stats: [
    { id: "player-1", name: "Ana", nickname: null, games: 1, wins: 1, draws: 0, losses: 0, goals: 2, assists: 0, points: 4 },
    { id: "player-2", name: "Bia", nickname: "B", games: 1, wins: 0, draws: 0, losses: 1, goals: 1, assists: 1, points: 2 },
    { id: "player-1", name: "Ana", nickname: null, games: 1, wins: 0, draws: 1, losses: 0, goals: 0, assists: 1, points: 1 },
  ],
};

describe("season domain", () => {
  it("builds the historical snapshot with the legacy ranking tie-breakers", () => {
    const summary = buildSeasonSummary(base, "2026-10-26T12:00:00.000Z");
    expect(summary).toMatchObject({ roundCount: 1, matchCount: 1, goalCount: 3, playerCount: 2 });
    expect(summary.ranking[0]).toMatchObject({ id: "player-1", games: 2, wins: 1, goals: 2, points: 5 });
  });

  it("blocks incomplete or empty seasons", () => {
    expect(() => buildSeasonSummary({ ...base, rounds: [] }, new Date().toISOString())).toThrow("não possui rodadas");
    expect(() => buildSeasonSummary({ ...base, rounds: [{ ...base.rounds[0], status: "active" }] }, new Date().toISOString()))
      .toThrow("rodada pendente");
    expect(() => buildSeasonSummary({ ...base, matches: [{ status: "live", eventCount: 0 }] }, new Date().toISOString()))
      .toThrow("partida pendente");
  });

  it("accepts only supported round types", () => {
    expect(parseRoundType("official")).toBe("official");
    expect(() => parseRoundType("all")).toThrow("inválido");
  });
});
