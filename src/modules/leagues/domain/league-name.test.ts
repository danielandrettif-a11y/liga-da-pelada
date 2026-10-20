import { describe, expect, it } from "vitest";
import { isDuplicateLeagueNameError, normalizeLeagueName } from "./league-name";

describe("nome da pelada", () => {
  it("normaliza espaços antes de comparar ou salvar", () => {
    expect(normalizeLeagueName("  Pelada   de   Quinta  ")).toBe("Pelada de Quinta");
  });

  it("reconhece a violação de unicidade do banco", () => {
    expect(isDuplicateLeagueNameError({ code: "23505" })).toBe(true);
    expect(isDuplicateLeagueNameError({ code: "P0001" })).toBe(false);
    expect(isDuplicateLeagueNameError(null)).toBe(false);
  });
});
