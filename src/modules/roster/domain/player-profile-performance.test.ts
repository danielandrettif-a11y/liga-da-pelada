import { describe, expect, it } from "vitest";
import { isPlayerClubGoals, isPlayerPlaytime } from "./player-profile-performance";

describe("player profile performance contracts", () => {
  it("accepts valid playtime totals", () => {
    expect(isPlayerPlaytime({ totalSeconds: 120, officialSeconds: 90, friendlySeconds: 30 })).toBe(true);
  });

  it("rejects malformed club aggregates", () => {
    expect(isPlayerClubGoals({ key: "club", name: "Clube", color: "#fff", crestUrl: null,
      officialGoals: 1, friendlyGoals: 0, totalGoals: -1 })).toBe(false);
  });
});
