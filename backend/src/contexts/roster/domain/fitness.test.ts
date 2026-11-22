import { describe, expect, it } from "vitest";
import { normalizeFitnessInput, parseRosterUuid, summarizeFitness } from "./fitness.js";

describe("fitness domain", () => {
  it("normalizes distance and accepts both km/h and meters/minute", () => {
    expect(normalizeFitnessInput(5.678, 12.345)).toEqual({ distanceKm: 5.68, averageSpeedKmh: 12.35 });
    expect(normalizeFitnessInput(5, 100)).toEqual({ distanceKm: 5, averageSpeedKmh: 6 });
  });

  it("rejects values outside the persisted constraints", () => {
    expect(() => normalizeFitnessInput(0, 10)).toThrow("distância");
    expect(() => normalizeFitnessInput(5, 1001)).toThrow("ritmo");
  });

  it("accepts UUID values already stored by legacy fixtures", () => {
    expect(parseRosterUuid("b0000000-0000-0000-0000-000000000001", "Pelada"))
      .toBe("b0000000-0000-0000-0000-000000000001");
  });

  it("summarizes official and friendly measurements independently", () => {
    expect(summarizeFitness([
      { roundType: "official", distanceKm: 5, averageSpeedKmh: 10 },
      { roundType: "official", distanceKm: 7, averageSpeedKmh: 14 },
      { roundType: "friendly", distanceKm: 3, averageSpeedKmh: 9 },
    ])).toEqual({
      official: { distanceKm: 12, averageSpeedKmh: 12, metersPerMinute: 200, entries: 2 },
      friendly: { distanceKm: 3, averageSpeedKmh: 9, metersPerMinute: 150, entries: 1 },
    });
  });
});
