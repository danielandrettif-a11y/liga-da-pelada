import { describe, expect, it } from "vitest";
import {
  callbackUrl, normalizeEmail, parseName, parsePassword, parsePkceExchange, parsePkceStart, safeReturnPath,
} from "./authentication.js";

const challenge = "a".repeat(43);

describe("authentication inputs", () => {
  it("normalizes credentials and safe return paths", () => {
    expect(normalizeEmail(" USER@Example.COM ")).toBe("user@example.com");
    expect(parseName("  Maria   Silva ")).toBe("Maria Silva");
    expect(parsePassword("password-123")).toBe("password-123");
    expect(safeReturnPath("/lobby?tab=1")).toBe("/lobby?tab=1");
    expect(safeReturnPath("//evil.example")).toBeNull();
  });

  it("validates PKCE material and builds an application-owned callback", () => {
    const start = parsePkceStart({ flowId: "1234567890abcdef", codeChallenge: challenge, returnPath: "/lobby" });
    expect(callbackUrl("https://app.example.com/base", start))
      .toBe("https://app.example.com/auth/callback?pkce_flow=1234567890abcdef&next=%2Flobby");
    expect(parsePkceExchange(" code ", "v".repeat(56))).toEqual({ code: "code", codeVerifier: "v".repeat(56) });
  });

  it("rejects unsafe or malformed values", () => {
    expect(() => normalizeEmail("invalid")).toThrow("e-mail válido");
    expect(() => parsePassword("short")).toThrow("8 caracteres");
    expect(() => parseName(" ")).toThrow("nome");
    expect(() => parsePkceStart({ flowId: "short", codeChallenge: challenge, returnPath: null })).toThrow("Fluxo");
    expect(() => parsePkceExchange("", "v".repeat(56))).toThrow("Código");
  });
});
