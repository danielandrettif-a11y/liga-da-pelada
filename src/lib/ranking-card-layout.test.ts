import { describe, expect, it } from "vitest";
import { getRankingCardLayout, rankingCardBoxPixels } from "./ranking-card-layout";

describe("ranking card layout", () => {
  it.each([
    [1, "gold", "circle"],
    [2, "silver", "silver-shield"],
    [3, "bronze", "bronze-cutout"],
    [4, "ranked", "ranked-shield"],
    [18, "ranked", "ranked-shield"],
  ] as const)("maps position %s to the expected visual", (position, tier, photoShape) => {
    const layout = getRankingCardLayout(position);
    expect(layout.tier).toBe(tier);
    expect(layout.photoShape).toBe(photoShape);
  });

  it("keeps every content box inside the card artwork", () => {
    for (const position of [1, 2, 3, 4]) {
      const layout = getRankingCardLayout(position);
      for (const box of [layout.header, layout.score, layout.photo, layout.name, layout.awards, layout.stats]) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.left + box.width).toBeLessThanOrEqual(100);
        expect(box.top + box.height).toBeLessThanOrEqual(100);
      }
    }
  });

  it("converts normalized boxes without changing their proportions", () => {
    expect(rankingCardBoxPixels(
      { left: 10, top: 20, width: 30, height: 40 },
      { x: 100, y: 200, width: 800, height: 1200 },
    )).toEqual({ x: 180, y: 440, width: 240, height: 480 });
  });

  it("keeps the gold portrait circular on a 2:3 card", () => {
    const photo = rankingCardBoxPixels(
      getRankingCardLayout(1).photo,
      { x: 0, y: 0, width: 360, height: 540 },
    );
    expect(Math.abs(photo.width - photo.height)).toBeLessThan(1);
  });
});
