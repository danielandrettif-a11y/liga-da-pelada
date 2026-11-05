import { describe, expect, it } from "vitest";
import { hasCallupClosingMatch, hasDrawnCallupTeams, isFinishedCallupRound } from "./callup-lifecycle";

describe("hasCallupClosingMatch", () => {
  it("mantém a convocação visível depois do sorteio e antes do primeiro jogo", () => {
    expect(hasCallupClosingMatch([])).toBe(false);
    expect(hasCallupClosingMatch([{ status: "pending", started_at: null }])).toBe(false);
  });

  it("fecha a convocação assim que o primeiro jogo começa", () => {
    expect(hasCallupClosingMatch([{ status: "live", started_at: null }])).toBe(true);
    expect(hasCallupClosingMatch([{ status: "pending", started_at: "2026-09-21T10:00:00Z" }])).toBe(true);
    expect(hasCallupClosingMatch([{ status: "finished", started_at: null }])).toBe(true);
  });
});

describe("hasDrawnCallupTeams", () => {
  it("não confunde times vazios da pré-lista com sorteio concluído", () => {
    expect(hasDrawnCallupTeams([])).toBe(false);
    expect(hasDrawnCallupTeams([{ team_players: [] }, { team_players: [] }])).toBe(false);
  });

  it("considera sorteado quando pelo menos um atleta foi distribuído", () => {
    expect(hasDrawnCallupTeams([
      { team_players: [] },
      { team_players: [{ player_id: "player-1" }] },
    ])).toBe(true);
  });
});

describe("isFinishedCallupRound", () => {
  it("remove apenas rodadas encerradas da lista de convocações atuais", () => {
    expect(isFinishedCallupRound({ status: "finished" })).toBe(true);
    expect(isFinishedCallupRound({ status: "in_progress" })).toBe(false);
    expect(isFinishedCallupRound({ status: "draft" })).toBe(false);
    expect(isFinishedCallupRound(null)).toBe(false);
  });
});
