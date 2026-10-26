import { describe, expect, it } from "vitest";
import { parseLeagueBranding } from "./league-branding.js";

describe("league branding rules", () => {
  it("normalizes the color and gives removal precedence over stale files", () => {
    expect(parseLeagueBranding({
      accent_color: " #AABBCC ", remove_logo: true,
      logo: { contentType: "image/png", bytes: new Uint8Array([1]) },
    })).toMatchObject({ accentColor: "#aabbcc", removeLogo: true, logo: null });
  });

  it("rejects invalid colors, media types and oversized assets", () => {
    expect(() => parseLeagueBranding({ accent_color: "green" })).toThrow("hexadecimal");
    expect(() => parseLeagueBranding({
      accent_color: "#aabbcc", logo: { contentType: "image/svg+xml", bytes: new Uint8Array([1]) },
    })).toThrow("escudo");
    expect(() => parseLeagueBranding({
      accent_color: "#aabbcc", logo: { contentType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
    })).toThrow("escudo");
    expect(() => parseLeagueBranding({
      accent_color: "#aabbcc", cover: { contentType: "image/png", bytes: new Uint8Array(8 * 1024 * 1024 + 1) },
    })).toThrow("capa");
  });
});
