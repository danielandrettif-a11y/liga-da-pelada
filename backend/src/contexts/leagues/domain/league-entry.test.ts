import { describe, expect, it } from "vitest";
import { parseEntryFlowVersion, parseLeagueSelection } from "./league-entry.js";

describe("league entry rules", () => {
  it("accepts a bounded presentation version and explicit selection modes", () => {
    expect(parseEntryFlowVersion(1)).toBe(1);
    expect(parseLeagueSelection("00000000-0000-4000-8000-000000000001", "active"))
      .toEqual({ leagueId: "00000000-0000-4000-8000-000000000001", mode: "active" });
  });

  it("rejects invalid versions, ids and implicit modes", () => {
    expect(() => parseEntryFlowVersion(0)).toThrow("Versão");
    expect(() => parseLeagueSelection("invalid", "active")).toThrow();
    expect(() => parseLeagueSelection("00000000-0000-4000-8000-000000000001", "archived"))
      .toThrow("inválido");
  });
});
