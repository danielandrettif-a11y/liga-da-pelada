import { describe, expect, it } from "vitest";
import { resolveFantasyCardBenefit, resolveFantasyCardPointBonus } from "./card-benefits";

describe("resolveFantasyCardBenefit", () => {
  it("uses persisted points and the lineup fallback", () => {
    expect(resolveFantasyCardBenefit({ slug: "super_captain", status: "RESOLVED", bonus: 0, fallbackBonus: 8 }).label).toBe("+8.0 pts");
  });

  it("describes economic cards without calling them zero points", () => {
    expect(resolveFantasyCardBenefit({ slug: "bargain", status: "RESOLVED", details: { discountAmount: 2.5, discountPercent: 20 } }).label).toBe("C$ 2,50 economizados");
    expect(resolveFantasyCardBenefit({ slug: "extra_credit", status: "RESOLVED", details: { budgetBonus: 5 } }).label).toBe("+C$ 5,00 temporários");
  });

  it("keeps unresolved cards in dispute", () => {
    expect(resolveFantasyCardBenefit({ slug: "head_to_head", status: "LOCKED" }).kind).toBe("pending");
  });

  it("soma no ranking apenas cartas que concedem pontos", () => {
    expect(resolveFantasyCardPointBonus({ slug: "golden_pass", status: "RESOLVED", bonus: 3 })).toBe(3);
    expect(resolveFantasyCardPointBonus({ slug: "bargain", status: "RESOLVED", details: { discountAmount: 2.5 } })).toBe(0);
    expect(resolveFantasyCardPointBonus({ slug: "head_to_head", status: "LOCKED", fallbackBonus: 6 })).toBe(0);
  });
});
