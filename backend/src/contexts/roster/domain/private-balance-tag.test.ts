import { describe, expect, it } from "vitest";
import { parsePlayerId, parsePrivateBalanceTag } from "./private-balance-tag.js";

describe("private balance tag", () => {
  it("accepts the closed tag set and explicit removal", () => {
    expect(parsePrivateBalanceTag("craque_2")).toBe("craque_2");
    expect(parsePrivateBalanceTag(null)).toBeNull();
  });

  it("rejects unknown tags and malformed player ids", () => {
    expect(() => parsePrivateBalanceTag("craque_3")).toThrow("inválida");
    expect(() => parsePlayerId("player-1")).toThrow("Jogador inválido");
    expect(parsePlayerId(" 00000000-0000-4000-8000-000000000001 ")).toBe("00000000-0000-4000-8000-000000000001");
    expect(parsePlayerId("a0000000-0000-0000-0000-000000000001")).toBe("a0000000-0000-0000-0000-000000000001");
  });
});
