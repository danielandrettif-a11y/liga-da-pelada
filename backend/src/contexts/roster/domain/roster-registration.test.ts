import { describe, expect, it } from "vitest";
import { parseRosterRegistrationUuid, validatePlayerMergeIds } from "./roster-registration.js";

describe("roster registration domain", () => {
  it("normalizes PostgreSQL UUID identifiers", () => {
    expect(parseRosterRegistrationUuid("00000000-0000-4000-8000-000000000010", "Pelada"))
      .toBe("00000000-0000-4000-8000-000000000010");
  });

  it("rejects malformed registration scopes", () => {
    expect(() => parseRosterRegistrationUuid("outside", "Jogador")).toThrow("Jogador inválido");
  });

  it("validates player merge pairs", () => {
    expect(validatePlayerMergeIds(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    )).toEqual({
      guestId: "00000000-0000-4000-8000-000000000001",
      registeredId: "00000000-0000-4000-8000-000000000002",
    });

    expect(() => validatePlayerMergeIds(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
    )).toThrow("Escolha dois perfis diferentes.");
  });
});
