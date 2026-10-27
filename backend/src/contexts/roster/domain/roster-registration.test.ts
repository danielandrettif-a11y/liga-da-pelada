import { describe, expect, it } from "vitest";
import { parseRosterRegistrationUuid } from "./roster-registration.js";

describe("roster registration domain", () => {
  it("normalizes PostgreSQL UUID identifiers", () => {
    expect(parseRosterRegistrationUuid("00000000-0000-4000-8000-000000000010", "Pelada"))
      .toBe("00000000-0000-4000-8000-000000000010");
  });

  it("rejects malformed registration scopes", () => {
    expect(() => parseRosterRegistrationUuid("outside", "Jogador")).toThrow("Jogador inválido");
  });
});
