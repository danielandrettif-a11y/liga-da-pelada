import { describe, expect, it } from "vitest";
import { buildAwardSeasonsByPlayer } from "./awards";

const rounds = [
  { id: "r1", number: 1, date: "2026-08-01", seasonId: "s1", seasonNumber: 1, seasonStatus: "finished" as const, bestGoalkeeperPlayerId: null },
  { id: "r2", number: 2, date: "2026-08-08", seasonId: "s1", seasonNumber: 1, seasonStatus: "finished" as const, bestGoalkeeperPlayerId: null },
];

describe("premios da temporada", () => {
  it("desempata o artilheiro pelo menor numero de jogos", () => {
    const result = buildAwardSeasonsByPlayer(rounds, [
      { player_id: "p1", round_id: "r1", goals: 3, assists: 0, games: 3 },
      { player_id: "p2", round_id: "r2", goals: 3, assists: 0, games: 2 },
    ]);
    expect(result.get("p1")?.[0].awards.some((award) => award.type === "seasonTopScorer")).toBe(false);
    expect(result.get("p2")?.[0].awards.some((award) => award.type === "seasonTopScorer")).toBe(true);
  });

  it("compartilha o titulo quando gols e jogos continuam empatados", () => {
    const result = buildAwardSeasonsByPlayer(rounds, [
      { player_id: "p1", round_id: "r1", goals: 2, assists: 1, games: 2 },
      { player_id: "p2", round_id: "r2", goals: 2, assists: 1, games: 2 },
    ]);
    expect(result.get("p1")?.[0].awards.some((award) => award.type === "seasonTopScorer")).toBe(true);
    expect(result.get("p2")?.[0].awards.some((award) => award.type === "seasonTopScorer")).toBe(true);
  });
});

