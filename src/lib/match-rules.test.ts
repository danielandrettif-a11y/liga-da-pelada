import { describe, expect, it } from "vitest";
import {
  getMatchHalfSeconds,
  getMatchTimerElapsedSeconds,
  getOfficialElapsedSeconds,
  isEntryResultEligible,
  transitionMatchTimer,
} from "./match-rules";

describe("match participation rules", () => {
  const sevenMinutes = 7 * 60;

  it("uses 03:30 as half of a seven-minute match", () => {
    expect(getMatchHalfSeconds(sevenMinutes)).toBe(210);
  });

  it("grants the result before and exactly at half time", () => {
    expect(isEntryResultEligible(0, sevenMinutes)).toBe(true);
    expect(isEntryResultEligible(209, sevenMinutes)).toBe(true);
    expect(isEntryResultEligible(210, sevenMinutes)).toBe(true);
  });

  it("does not grant the result after half time", () => {
    expect(isEntryResultEligible(211, sevenMinutes)).toBe(false);
    expect(isEntryResultEligible(419, sevenMinutes)).toBe(false);
  });

  it("keeps official elapsed time after the visible clock is reset", () => {
    const elapsedBeforeReset = 240;
    const elapsedAfterReset = 15;
    expect(getOfficialElapsedSeconds(elapsedAfterReset, elapsedBeforeReset)).toBe(255);
    expect(isEntryResultEligible(255, sevenMinutes)).toBe(false);
  });

  it("never produces negative time from invalid inputs", () => {
    expect(getMatchHalfSeconds(-1)).toBe(0);
    expect(getOfficialElapsedSeconds(-10, -20)).toBe(0);
  });

  it("starts immediately and preserves the elapsed time when paused", () => {
    const started = transitionMatchTimer({ startedAt: null, accumulated: 12 }, "start", 10_000);
    expect(started).toEqual({ startedAt: "1970-01-01T00:00:10.000Z", accumulated: 12 });
    expect(getMatchTimerElapsedSeconds(started, 15_900)).toBe(17);
    expect(transitionMatchTimer(started, "pause", 15_900)).toEqual({ startedAt: null, accumulated: 17 });
  });
});
