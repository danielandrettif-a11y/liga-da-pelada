import { describe, expect, it } from "vitest";
import { pickFairSubstitute } from "./substitution-draw";

const candidates = [{ playerId: "a" }, { playerId: "b" }, { playerId: "c" }];

describe("sorteio justo de substituição", () => {
  it("prioriza quem ainda não ganhou a vaga", () => {
    const picked = pickFairSubstitute(candidates, new Map([["a", 1], ["b", 0], ["c", 1]]), new Set(), () => 0.8);
    expect(picked?.playerId).toBe("b");
  });

  it("não reutiliza o substituto já escolhido na mesma partida", () => {
    const picked = pickFairSubstitute(candidates, new Map(), new Set(["a", "b"]), () => 0);
    expect(picked?.playerId).toBe("c");
  });

  it("volta a sortear todos depois que a contagem empata", () => {
    const picked = pickFairSubstitute(candidates, new Map([["a", 1], ["b", 1], ["c", 1]]), new Set(), () => 0.99);
    expect(picked?.playerId).toBe("c");
  });
});
