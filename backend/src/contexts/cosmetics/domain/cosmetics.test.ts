import { describe, expect, it } from "vitest";
import { emptyEquippedSummary, isValidCosmeticSlot, mapEquippedRow, VALID_COSMETIC_SLOTS } from "./cosmetics.js";

describe("Cosmetics Domain", () => {
  it("accepts exactly the eight account cosmetic slots", () => {
    for (const slot of ["banner", "frame", "title", "aura", "nameplate", "background", "showcase", "pitch"]) {
      expect(isValidCosmeticSlot(slot)).toBe(true);
    }
    expect(isValidCosmeticSlot("border")).toBe(false);
    expect(isValidCosmeticSlot("avatar")).toBe(false);
    expect(VALID_COSMETIC_SLOTS).toHaveLength(8);
  });

  it("maps every joined loadout field to the public summary contract", () => {
    expect(mapEquippedRow({
      frame_key: "frame-1", aura_key: "aura-1", title_name: "Craque",
      banner_key: "banner-1", nameplate_key: "plate-1", background_key: "bg-1",
      showcase_key: "show-1", pitch_key: "pitch-1",
    })).toEqual({
      frameKey: "frame-1", auraKey: "aura-1", titleName: "Craque",
      bannerAssetKey: "banner-1", nameplateKey: "plate-1", backgroundAssetKey: "bg-1",
      showcaseAssetKey: "show-1", pitchAssetKey: "pitch-1",
    });
  });

  it("provides a complete empty summary", () => {
    expect(Object.keys(emptyEquippedSummary())).toHaveLength(8);
    expect(Object.values(emptyEquippedSummary()).every((value) => value === null)).toBe(true);
  });
});
