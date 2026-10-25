import { describe, expect, it } from "vitest";
import { parseLeagueId, parseNewLeague } from "./league.js";
import { parseNewLeague as parseCurrentLeague } from "../../../../../src/modules/leagues/domain/league-creation";

describe("league domain", () => {
  it("forces disposable leagues to private visibility and normalizes the name", () => {
    expect(parseNewLeague({ name: "  Pelada   BQ ", tier: "quick", visibility: "open" }))
      .toEqual({ name: "Pelada BQ", tier: "quick", visibility: "private" });
  });

  it("rejects invalid names and modes", () => {
    expect(() => parseNewLeague({ name: "ab", tier: "basic", visibility: "private" })).toThrow();
    expect(() => parseNewLeague({ name: "Pelada", tier: "unknown", visibility: "private" })).toThrow();
  });

  it("preserves the current application's creation rules", () => {
    const inputs = [
      { name: "  Pelada   BQ ", tier: "quick", visibility: "open" },
      { name: "Amigos", tier: "complete", visibility: "open" },
      { name: "ab", tier: "basic", visibility: "private" },
      { name: "Amigos", tier: "invalid", visibility: "private" },
    ];
    for (const input of inputs) {
      const current = parseCurrentLeague(input);
      const migrated = (() => { try { return parseNewLeague(input); } catch { return null; } })();
      expect(migrated).toEqual(current);
    }
  });

  it("accepts UUID values already stored by legacy fixtures", () => {
    expect(parseLeagueId("b0000000-0000-0000-0000-000000000001"))
      .toBe("b0000000-0000-0000-0000-000000000001");
  });
});
