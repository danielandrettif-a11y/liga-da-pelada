import { describe, expect, it } from "vitest";
import { getCallupDrawMinimum, getPlayersMissingForCallupDraw } from "./callup-draw";

describe("mínimo para sortear uma convocação", () => {
  it("libera uma rodada de 21 vagas a partir de 18 confirmados", () => {
    expect(getCallupDrawMinimum(21)).toBe(18);
    expect(getPlayersMissingForCallupDraw(17, 21)).toBe(1);
    expect(getPlayersMissingForCallupDraw(18, 21)).toBe(0);
  });

  it("mantém no mínimo dois jogadores em capacidades pequenas", () => {
    expect(getCallupDrawMinimum(3)).toBe(2);
  });
});
