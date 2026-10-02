import { describe, expect, it } from "vitest";
import { formatTeamNameWithReference, getTeamReference } from "./team-reference";

describe("team reference", () => {
  it("maps persisted team positions to letters", () => {
    expect(getTeamReference({ position: 1 })).toBe("A");
    expect(getTeamReference({ position: 2 })).toBe("B");
    expect(getTeamReference({ position: 3 })).toBe("C");
  });

  it("uses the visual index when a position is unavailable", () => {
    expect(getTeamReference(null, 2)).toBe("C");
  });

  it("keeps the name as secondary context", () => {
    expect(formatTeamNameWithReference({ position: 2, name: "Patético de Madrid" })).toBe("B · Patético de Madrid");
  });
});
