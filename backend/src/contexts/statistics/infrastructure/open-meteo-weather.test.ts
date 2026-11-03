import { describe, expect, it } from "vitest";
import { summarizeEventWeather, summarizeWeeklyForecast } from "./open-meteo-weather.js";

describe("Statistics Infrastructure: Open-Meteo weather", () => {
  it("summarizes rain during the event window", () => {
    const result = summarizeEventWeather({
      time: ["2026-11-03T08:00", "2026-11-03T09:00", "2026-11-03T10:00"],
      precipitation_probability: [10, 80, 20],
      precipitation: [0, 5.2, 0],
    }, "2026-11-03", "08:30", 90);
    expect(result).toEqual({ precipitationProbability: 80, precipitationMm: 5.2, label: "Chuva provável" });
  });

  it("preserves the seven-day forecast contract from the legacy dashboard", () => {
    const result = summarizeWeeklyForecast({
      time: ["2026-11-03", "2026-11-04"],
      precipitation_probability_max: [20, 75],
      precipitation_sum: [0, 6.25],
      temperature_2m_min: [18, 19],
      temperature_2m_max: [28, 27],
    });
    expect(result).toEqual([
      { date: "2026-11-03", precipitationProbability: 20, precipitationMm: 0, temperatureMin: 18, temperatureMax: 28, label: "Sem chuva prevista" },
      { date: "2026-11-04", precipitationProbability: 75, precipitationMm: 6.3, temperatureMin: 19, temperatureMax: 27, label: "Chuva provável" },
    ]);
  });
});
