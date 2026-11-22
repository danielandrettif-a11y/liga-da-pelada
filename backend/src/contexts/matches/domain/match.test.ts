import { describe, expect, it } from "vitest";
import {
  MatchValidationError,
  parseMatchUuid,
  validateExtraSeconds,
  validateGoalCorrectionConfirmation,
  validateTimerAction,
  validateTimerThreshold,
} from "./match.js";

describe("match domain validations", () => {
  it("validates valid UUIDs", () => {
    const validUuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(parseMatchUuid(validUuid, "ID")).toBe(validUuid);
  });

  it("throws error for invalid UUIDs", () => {
    expect(() => parseMatchUuid("invalid", "ID")).toThrow(MatchValidationError);
    expect(() => parseMatchUuid("", "ID")).toThrow(MatchValidationError);
  });

  it("validates timer actions", () => {
    expect(validateTimerAction("start")).toBe("start");
    expect(validateTimerAction("pause")).toBe("pause");
    expect(() => validateTimerAction("reset")).toThrow(MatchValidationError);
  });

  it("validates timer thresholds", () => {
    expect(validateTimerThreshold("one_minute")).toBe("one_minute");
    expect(validateTimerThreshold("thirty_seconds")).toBe("thirty_seconds");
    expect(validateTimerThreshold("finished")).toBe("finished");
    expect(() => validateTimerThreshold("two_minutes")).toThrow(MatchValidationError);
  });

  it("validates extra seconds", () => {
    expect(validateExtraSeconds(60)).toBe(60);
    expect(validateExtraSeconds(-30)).toBe(-30);
    expect(() => validateExtraSeconds(1.5)).toThrow(MatchValidationError);
    expect(() => validateExtraSeconds(4000)).toThrow(MatchValidationError);
  });

  it("validates goal correction confirmation", () => {
    expect(() => validateGoalCorrectionConfirmation("CONFIRMAR")).not.toThrow();
    expect(() => validateGoalCorrectionConfirmation("confirmar")).not.toThrow();
    expect(() => validateGoalCorrectionConfirmation("nao")).toThrow(MatchValidationError);
  });
});
