import { describe, expect, it } from "vitest";
import { validateFinishedGoalCorrection } from "./finished-goal-correction";

describe("validação de gol em partida finalizada", () => {
  it("exige confirmação explícita para todos os comandos", () => {
    for (const input of [
      { kind: "remove" as const, eventId: "event-1", confirmation: "" },
      { kind: "edit" as const, eventId: "event-1", playerId: "player-1", assistPlayerId: null, confirmation: "" },
      { kind: "add" as const, matchId: "match-1", teamId: "team-1", playerId: "player-1", assistPlayerId: null, confirmation: "" },
    ]) {
      expect(validateFinishedGoalCorrection(input))
        .toBe("Digite EDITAR para liberar correções em partidas finalizadas.");
    }
  });

  it("preserva a validação de autor e time para editar/adicionar", () => {
    expect(validateFinishedGoalCorrection({
      kind: "edit", eventId: "", playerId: "player-1", assistPlayerId: null, confirmation: "EDITAR",
    })).toBe("Escolha o autor do gol.");
    expect(validateFinishedGoalCorrection({
      kind: "add", matchId: "match-1", teamId: "", playerId: "player-1",
      assistPlayerId: null, confirmation: "EDITAR",
    })).toBe("Escolha o time e o autor do gol.");
    expect(validateFinishedGoalCorrection({
      kind: "remove", eventId: "event-1", confirmation: "EDITAR",
    })).toBeNull();
  });
});
