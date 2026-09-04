import { describe, expect, it } from "vitest";
import { resolveFantasyPitchPoints } from "./pitch-points";

describe("pontuação exibida no campo do Cartola", () => {
  it("usa a pontuação total persistida da última escalação fora do ao vivo", () => {
    expect(resolveFantasyPitchPoints({
      status: "between_rounds",
      marketRoundPoints: 28,
      lastRoundLineupPoints: 82.5,
      isCaptain: true,
      captainMultiplier: 1.5,
    })).toBe(82.5);
  });

  it("preserva zero quando essa foi a pontuação apurada", () => {
    expect(resolveFantasyPitchPoints({
      status: "open",
      marketRoundPoints: 18,
      lastRoundLineupPoints: 0,
      isCaptain: false,
      captainMultiplier: 1.5,
    })).toBe(0);
  });

  it("mantém a projeção da escalação atual durante a rodada ao vivo", () => {
    expect(resolveFantasyPitchPoints({
      status: "in_progress",
      marketRoundPoints: 28,
      lastRoundLineupPoints: 82.5,
      liveLineupPoints: 34,
      isCaptain: true,
      captainMultiplier: 1.5,
    })).toBe(34);
  });

  it("mantém o cálculo anterior como fallback quando ainda não há apuração pessoal", () => {
    expect(resolveFantasyPitchPoints({
      status: "in_progress",
      marketRoundPoints: 20,
      isCaptain: true,
      captainMultiplier: 1.5,
    })).toBe(30);
  });
});
