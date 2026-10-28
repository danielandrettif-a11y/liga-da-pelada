import { describe, expect, it } from "vitest";
import {
  parseCallupUuid,
  validateOpenCallupInput,
  validateUpdateCallupInput,
  InvalidCallupError,
} from "./callup.js";

describe("callup domain", () => {
  it("normalizes and validates UUIDs", () => {
    expect(parseCallupUuid("00000000-0000-4000-8000-000000000010", "Convocação"))
      .toBe("00000000-0000-4000-8000-000000000010");
    expect(() => parseCallupUuid("invalid-id", "Convocação")).toThrow(InvalidCallupError);
  });

  it("validates open callup inputs with default and custom formats", () => {
    const valid = validateOpenCallupInput({
      date: "2026-11-01",
      startTime: "09:30:00",
      stadiumId: "00000000-0000-4000-8000-000000000020",
      roundType: "official",
      playersPerTeam: 6,
      teamsPerRound: 4,
    });
    expect(valid).toEqual({
      date: "2026-11-01",
      startTime: "09:30",
      stadiumId: "00000000-0000-4000-8000-000000000020",
      roundType: "official",
      playersPerTeam: 6,
      teamsPerRound: 4,
      capacity: 24,
    });

    expect(() => validateOpenCallupInput({ date: "01/11/2026" }))
      .toThrow("Informe uma data válida");
    expect(() => validateOpenCallupInput({ date: "2026-11-01", playersPerTeam: 4 }))
      .toThrow("Escolha 5, 6 ou 7 jogadores por time");
    expect(() => validateOpenCallupInput({ date: "2026-11-01", teamsPerRound: 1 }))
      .toThrow("Escolha de 2 a 6 times");
  });

  it("validates update callup inputs", () => {
    const updated = validateUpdateCallupInput({
      date: "2026-11-05",
      startTime: "10:00",
      stadiumId: null,
      roundType: "friendly",
    });
    expect(updated).toEqual({
      date: "2026-11-05",
      startTime: "10:00",
      stadiumId: null,
      roundType: "friendly",
    });
  });
});
