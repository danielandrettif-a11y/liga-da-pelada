import { describe, expect, it } from "vitest";

import { cosmeticAuraClass, cosmeticAuraVariant, cosmeticFrameImage, cosmeticImage, cosmeticMobileBackgroundImage, cosmeticNameplateClass } from "./cosmetics";

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

describe("house 40 legendary collection", () => {
  it("maps the frame, emblem and Cartola pitch to dedicated assets", () => {
    expect(cosmeticFrameImage("frame-lenda-campinho")).toBe("/images/cosmetics/house-40/moldura-lenda-campinho-v1.webp");
    expect(cosmeticImage("showcase-lenda-campinho")).toBe("/images/cosmetics/house-40/emblema-lenda-campinho-v1.webp");
    expect(cosmeticImage("pitch-lenda-campinho")).toBe("/images/cartola/campo-lenda-campinho-v1.webp");
  });
});

describe("Luzes da Pelada replacement", () => {
  it("uses the sharp v2 artwork on desktop and mobile", () => {
    expect(cosmeticImage("background-por-do-sol-quadra")).toBe("/images/cosmetics/backgrounds/luzes-pelada-2026-v2.webp");
    expect(cosmeticMobileBackgroundImage("background-por-do-sol-quadra")).toBe("/images/cosmetics/backgrounds/luzes-pelada-mobile-2026-v2.webp");
  });
});
