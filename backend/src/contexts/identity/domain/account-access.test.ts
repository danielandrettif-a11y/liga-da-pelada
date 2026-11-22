import { describe, expect, it } from "vitest";
import { accountRole, parseAccountId } from "./account-access.js";

describe("account access", () => {
  it("accepts UUID account ids and derives the requested role", () => {
    expect(parseAccountId(" 00000000-0000-4000-8000-000000000001 ")).toBe("00000000-0000-4000-8000-000000000001");
    expect(accountRole(true)).toBe("admin");
    expect(accountRole(false)).toBe("player");
  });

  it("rejects malformed account ids", () => {
    expect(() => parseAccountId("user-controlled-value")).toThrow("Escolha uma conta cadastrada");
  });
});
