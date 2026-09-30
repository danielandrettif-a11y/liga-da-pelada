import { describe, expect, it } from "vitest";
import { summarizeEventWeather, summarizeWeeklyForecast } from "./weather";

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

describe("summarizeWeeklyForecast", () => {
  it("limita a previsão a sete dias e classifica a chuva", () => {
    const days = summarizeWeeklyForecast({
      time: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"],
      precipitation_probability_max: [10, 40, 80, 0, 0, 0, 0, 90],
      precipitation_sum: [0, 0.3, 8, 0, 0, 0, 0, 10],
      temperature_2m_min: [20, 21, 19, 18, 20, 21, 22, 23],
      temperature_2m_max: [28, 29, 25, 27, 30, 31, 32, 33],
    });

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.label).slice(0, 3)).toEqual(["Sem chuva prevista", "Pode chover", "Chuva provável"]);
  });
});
