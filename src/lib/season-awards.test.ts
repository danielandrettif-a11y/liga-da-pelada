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

  it("premia um unico Xerife pela melhor media defensiva da rodada", () => {
    const result = buildAwardSeasonsByPlayer(rounds, [
      { player_id: "def-1", round_id: "r1", goals: 0, assists: 0, games: 2, defensive_clean_games: 1, defensive_one_goal_games: 1, team_goals_conceded: 1, player: { player_profile: "defensive", member_category: "player", is_selectable: true } },
      { player_id: "def-2", round_id: "r1", goals: 0, assists: 0, games: 2, defensive_clean_games: 1, defensive_one_goal_games: 0, team_goals_conceded: 2, player: { player_profile: "defensive", member_category: "player", is_selectable: true } },
      { player_id: "ata", round_id: "r1", goals: 0, assists: 0, games: 2, defensive_clean_games: 2, defensive_one_goal_games: 0, team_goals_conceded: 0, player: { player_profile: "offensive", member_category: "player", is_selectable: true } },
    ]);
    expect(result.get("def-1")?.[0].awards.some((award) => award.type === "bestDefender")).toBe(true);
    expect(result.get("def-2")?.[0].awards.some((award) => award.type === "bestDefender")).toBe(false);
    expect(result.get("ata")?.[0].awards.some((award) => award.type === "bestDefender")).toBe(false);
  });
});
