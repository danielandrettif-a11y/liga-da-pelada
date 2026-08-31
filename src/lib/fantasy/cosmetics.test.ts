import { describe, expect, it } from "vitest";

import { cosmeticAuraClass, cosmeticAuraVariant, cosmeticNameplateClass } from "./cosmetics";

describe("cosmetic aura variants", () => {
  it("maps VAR da Varzea to its animated review effect", () => {
    expect(cosmeticAuraVariant("aura-var-da-varzea")).toBe("review");
    expect(cosmeticAuraClass("aura-var-da-varzea")).toBe("cosmetic-aura-host cosmetic-aura-host--review");
  });
});

describe("cosmetic nameplate classes", () => {
  it("maps Placa de Substituicao to the split red and green panel", () => {
    const className = cosmeticNameplateClass("nameplate-placa-substituicao");

    expect(className).toContain("linear-gradient(90deg");
    expect(className).toContain("font-mono");
  });
});
