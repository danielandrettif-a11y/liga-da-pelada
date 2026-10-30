import { describe, it, expect } from "vitest";
import {
  isValidCosmeticSlot,
  sanitizeEquippedCosmetics,
  buildEquippedSummaryFromItems,
  VALID_COSMETIC_SLOTS,
} from "./cosmetics.js";

describe("Cosmetics Domain", () => {
  it("validates cosmetic slots correctly", () => {
    expect(isValidCosmeticSlot("border")).toBe(true);
    expect(isValidCosmeticSlot("avatar")).toBe(true);
    expect(isValidCosmeticSlot("card_theme")).toBe(true);
    expect(isValidCosmeticSlot("goal_effect")).toBe(true);
    expect(isValidCosmeticSlot("invalid_slot")).toBe(false);
    expect(VALID_COSMETIC_SLOTS).toHaveLength(4);
  });

  it("sanitizes user equipped cosmetics", () => {
    const raw = {
      border: "  border-1  ",
      avatar: "",
      card_theme: null,
      goal_effect: "  fx-1  ",
    };
    const sanitized = sanitizeEquippedCosmetics(raw);
    expect(sanitized).toEqual({
      border: "border-1",
      avatar: null,
      card_theme: null,
      goal_effect: "fx-1",
    });
  });

  it("builds equipped summary from items and loadout matching slot integrity", () => {
    const items = new Map([
      ["border-1", { id: "border-1", name: "Dourada", assetUrl: "/gold.png", slot: "border" as const }],
      ["avatar-1", { id: "avatar-1", name: "Mascote", assetUrl: "/mascot.png", slot: "avatar" as const }],
      ["wrong-slot", { id: "wrong-slot", name: "Errado", assetUrl: "/err.png", slot: "card_theme" as const }],
    ]);

    const loadout = {
      border: "border-1",
      avatar: "avatar-1",
      card_theme: "wrong-slot", // slot matches card_theme!
      goal_effect: "non-existent",
    };

    const summary = buildEquippedSummaryFromItems(items, loadout);
    expect(summary.border).toEqual({ id: "border-1", name: "Dourada", assetUrl: "/gold.png" });
    expect(summary.avatar).toEqual({ id: "avatar-1", name: "Mascote", assetUrl: "/mascot.png" });
    expect(summary.card_theme).toEqual({ id: "wrong-slot", name: "Errado", assetUrl: "/err.png" });
    expect(summary.goal_effect).toBeNull();
  });
});
