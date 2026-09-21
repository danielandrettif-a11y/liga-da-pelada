import { describe, expect, it } from "vitest";
import { hasCallupClosingMatch } from "./callup-lifecycle";

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
