import { describe, it, expect } from "vitest";
import {
  validateMessageBody,
  validateMessageKind,
} from "./collective.js";

describe("Collective Domain", () => {
  it("validates message body length and emptiness", () => {
    expect(validateMessageBody("").valid).toBe(false);
    expect(validateMessageBody("   ").valid).toBe(false);
    expect(validateMessageBody("Olá time!").valid).toBe(true);

    const longText = "a".repeat(1001);
    expect(validateMessageBody(longText).valid).toBe(false);
  });

  it("validates message kind", () => {
    expect(validateMessageKind("text")).toBe(true);
    expect(validateMessageKind("image")).toBe(true);
    expect(validateMessageKind("audio")).toBe(true);
    expect(validateMessageKind("video")).toBe(false);
  });
});
