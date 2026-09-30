import { describe, expect, it } from "vitest";
import { summarizeEventWeather } from "./weather";

describe("summarizeEventWeather", () => {
  it("resume somente as horas que cruzam o período da pelada", () => {
    expect(summarizeEventWeather({
      time: ["2026-10-03T19:00", "2026-10-03T20:00", "2026-10-03T21:00", "2026-10-03T22:00", "2026-10-03T23:00"],
      precipitation_probability: [90, 10, 40, 70, 95],
      precipitation: [8, 0, 0.4, 1.2, 9],
    }, "2026-10-03", "20:30", 90)).toEqual({
      precipitationProbability: 70,
      precipitationMm: 1.6,
      label: "Chuva provável",
    });
  });
});
