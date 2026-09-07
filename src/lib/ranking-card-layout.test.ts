import { describe, expect, it } from "vitest";
import type { RankingEntry } from "./ranking";
import {
  buildRankingCardContent,
  getRankingCardLayout,
  getRankingCardTheme,
  getRankingCardTier,
  rankingCardBoxPixels,
} from "./ranking-card-layout";

describe("ranking card layout", () => {
  it.each([
    [1, "gold", "OURO"],
    [2, "silver", "PRATA"],
    [3, "bronze", "BRONZE"],
    [4, "ranked", "RANKED"],
    [18, "ranked", "RANKED"],
  ] as const)("maps position %s to the expected theme", (position, tier, label) => {
    expect(getRankingCardTier(position)).toBe(tier);
    expect(getRankingCardTheme(position)).toMatchObject({ tier, label });
  });

  it("uses the same geometry and photo shape for every tier", () => {
    const layout = getRankingCardLayout();
    expect(layout.photoShape).toBe("shield");
    for (const position of [1, 2, 3, 4, 18]) {
      expect(getRankingCardLayout()).toBe(layout);
      expect(getRankingCardTheme(position).artwork).toContain("-v2.webp");
    }
  });

  it("keeps every content box inside the card artwork", () => {
    const layout = getRankingCardLayout();
    for (const box of [layout.header, layout.score, layout.photo, layout.name, layout.awards, layout.stats]) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.left + box.width).toBeLessThanOrEqual(100);
      expect(box.top + box.height).toBeLessThanOrEqual(100);
    }
  });

  it("keeps stacked content regions separated", () => {
    const { score, photo, name, awards, stats } = getRankingCardLayout();
    expect(score.left + score.width).toBeLessThan(photo.left);
    expect(Math.max(score.top + score.height, photo.top + photo.height)).toBeLessThan(name.top);
    expect(name.top + name.height).toBeLessThan(awards.top);
    expect(awards.top + awards.height).toBeLessThan(stats.top);
  });

  it("converts normalized boxes without changing their proportions", () => {
    expect(rankingCardBoxPixels(
      { left: 10, top: 20, width: 30, height: 40 },
      { x: 100, y: 200, width: 800, height: 1200 },
    )).toEqual({ x: 180, y: 440, width: 240, height: 480 });
  });

  it("builds the same complete information set even when awards are zero", () => {
    const entry = {
      player: { name: "Jogador Teste", player_profile: "defensive", is_goalkeeper: false },
      points: 53.5,
      goals: 5,
      assists: 4,
      wins: 12,
      games: 23,
      losses: 6,
      winRate: 59,
      awards: { roundMvp: 2, topScorer: 0, topAssister: 1, kingOfWins: 3 },
      cosmetics: { titleName: null },
    } as RankingEntry;

    const content = buildRankingCardContent(entry, 7);
    expect(content).toMatchObject({
      header: "PBQ • RANKED",
      points: "53.5",
      profile: "DEF",
      placement: "7º",
      name: "Jogador Teste",
      title: null,
    });
    expect(content.awards.map(({ label, value }) => [label, value])).toEqual([
      ["Craque", 2],
      ["Artilheiro", 0],
      ["Garçom", 1],
      ["Rei das Vitórias", 3],
    ]);
    expect(content.stats.map(({ label }) => label)).toEqual(["GOL", "AST", "VIT", "JOG", "DER", "APR"]);
  });
});
