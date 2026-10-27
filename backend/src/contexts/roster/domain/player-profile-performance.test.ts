import { describe, expect, it } from "vitest";
import { goalsByClub, totalPlayerPlaytime } from "./player-profile-performance.js";

describe("player profile performance", () => {
  it("sums closed and live participation intervals by round type", () => {
    const result = totalPlayerPlaytime([{
      enteredElapsedSeconds: 60, leftElapsedSeconds: 240, startedAt: "2026-10-20T10:00:00.000Z",
      finishedAt: "2026-10-20T10:07:00.000Z", timerStartedAt: null, timerAccumulatedSeconds: 420,
      roundType: "official",
    }, {
      enteredElapsedSeconds: 30, leftElapsedSeconds: null, startedAt: "2026-10-20T11:00:00.000Z",
      finishedAt: null, timerStartedAt: "2026-10-20T11:05:00.000Z", timerAccumulatedSeconds: 120,
      roundType: "friendly",
    }], new Date("2026-10-20T11:07:00.000Z"));
    expect(result).toEqual({ totalSeconds: 390, officialSeconds: 180, friendlySeconds: 210 });
  });

  it("groups goals by crest and restores canonical preset presentation", () => {
    const result = goalsByClub([{
      teamId: "team-1", teamName: "Nome antigo", teamColor: "#000000",
      crestUrl: "/team-crests/milamb.webp", roundType: "official",
    }, {
      teamId: "team-2", teamName: "Time Azul", teamColor: "#0000FF",
      crestUrl: null, roundType: "friendly",
    }]);
    expect(result).toMatchObject([
      { name: "MilamB", color: "#DC2626", officialGoals: 1, totalGoals: 1 },
      { name: "Time Azul", friendlyGoals: 1, totalGoals: 1 },
    ]);
  });
});
