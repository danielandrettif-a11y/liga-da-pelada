import { describe, expect, it } from "vitest";
import {
  drawRoundPlayerOrder,
  InvalidRoundError,
  parseRoundUuid,
  validateRoundDate,
  validateRoundTime,
  validateRoundType,
  validateTeamSizes,
  validateUnderfilledRoundTeams,
} from "./round.js";

describe("Round domain", () => {
  it("validates and normalizes valid UUIDs", () => {
    const valid = "00000000-0000-4000-8000-000000000001";
    expect(parseRoundUuid(valid, "Rodada")).toBe(valid);
    expect(parseRoundUuid(valid.toUpperCase(), "Rodada")).toBe(valid);
  });

  it("throws on invalid UUID format", () => {
    expect(() => parseRoundUuid("invalid-uuid", "Rodada")).toThrow(InvalidRoundError);
  });

  it("validates round date format", () => {
    expect(validateRoundDate("2026-10-30")).toBe("2026-10-30");
    expect(() => validateRoundDate("30/10/2026")).toThrow(InvalidRoundError);
  });

  it("validates round time and type", () => {
    expect(validateRoundTime("20:30")).toBe("20:30");
    expect(validateRoundType("friendly")).toBe("friendly");
    expect(() => validateRoundTime("25:00")).toThrow(InvalidRoundError);
    expect(() => validateRoundType("training")).toThrow(InvalidRoundError);
  });

  it("validates team sizes (players per team and teams per round)", () => {
    expect(validateTeamSizes(6, 4)).toEqual({ playersPerTeam: 6, teamsPerRound: 4 });
    expect(() => validateTeamSizes(4, 4)).toThrow("Escolha 5, 6 ou 7 jogadores por time.");
    expect(() => validateTeamSizes(8, 4)).toThrow("Escolha 5, 6 ou 7 jogadores por time.");
    expect(() => validateTeamSizes(6, 1)).toThrow("Escolha de 2 a 6 times.");
    expect(() => validateTeamSizes(6, 7)).toThrow("Escolha de 2 a 6 times.");
  });

  it("accepts balanced underfilled teams and rejects uneven distributions", () => {
    expect(() => validateUnderfilledRoundTeams([5, 5, 4], 14, 6)).not.toThrow();
    expect(() => validateUnderfilledRoundTeams([6, 4, 4], 14, 6)).toThrow("diferença entre os times");
    expect(() => validateUnderfilledRoundTeams([5, 5], 10, 6)).toThrow("pelo menos 12 jogadores");
  });

  it("draws every player once with contiguous order", () => {
    expect(drawRoundPlayerOrder(["a", "b", "c"], () => 0)).toEqual([
      { playerId: "b", order: 1 },
      { playerId: "c", order: 2 },
      { playerId: "a", order: 3 },
    ]);
  });
});
