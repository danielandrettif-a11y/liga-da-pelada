import { describe, expect, it } from "vitest";
import {
  normalizeGoalkeeperElapsedHint,
  validateFixedGoalkeeperSelection,
  validateGoalkeeperChange,
} from "./goalkeeper-management";

describe("validação de goleiros", () => {
  it("exige rodada, time e pelada para o goleiro fixo", () => {
    expect(validateFixedGoalkeeperSelection("round-1", "team-1", "league-1")).toBeNull();
    expect(validateFixedGoalkeeperSelection("", "team-1", "league-1")).toBe("Time inválido.");
    expect(validateFixedGoalkeeperSelection("round-1", "", "league-1")).toBe("Time inválido.");
    expect(validateFixedGoalkeeperSelection("round-1", "team-1", null)).toBe("Time inválido.");
  });

  it("exige partida, time e jogador na troca durante o jogo", () => {
    expect(validateGoalkeeperChange("match-1", "team-1", "player-1")).toBeNull();
    expect(validateGoalkeeperChange("", "team-1", "player-1"))
      .toBe("Escolha um jogador para entrar no gol.");
    expect(validateGoalkeeperChange("match-1", "", "player-1"))
      .toBe("Escolha um jogador para entrar no gol.");
    expect(validateGoalkeeperChange("match-1", "team-1", ""))
      .toBe("Escolha um jogador para entrar no gol.");
  });

  it("trata tempo do navegador apenas como dica saneada", () => {
    expect(normalizeGoalkeeperElapsedHint(12.9)).toBe(12);
    expect(normalizeGoalkeeperElapsedHint(-3)).toBe(0);
    expect(normalizeGoalkeeperElapsedHint(Infinity)).toBeNull();
    expect(normalizeGoalkeeperElapsedHint()).toBeNull();
  });
});
