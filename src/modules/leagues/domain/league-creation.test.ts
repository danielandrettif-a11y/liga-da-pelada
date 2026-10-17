import { describe, expect, it } from "vitest";
import { parseNewLeague } from "./league-creation";

describe("dados da nova pelada", () => {
  it("normaliza espaços sem mudar as escolhas do usuário", () => {
    expect(parseNewLeague({ name: "  Pelada   HG  ", tier: "complete", visibility: "open" }))
      .toEqual({ name: "Pelada HG", tier: "complete", visibility: "open" });
  });

  it.each([
    { name: "HG", tier: "basic", visibility: "private" },
    { name: "Pelada HG", tier: "other", visibility: "private" },
    { name: "Pelada HG", tier: "basic", visibility: "other" },
    { name: "x".repeat(81), tier: "basic", visibility: "private" },
  ])("recusa entrada inválida: %j", (input) => {
    expect(parseNewLeague(input)).toBeNull();
  });
});
