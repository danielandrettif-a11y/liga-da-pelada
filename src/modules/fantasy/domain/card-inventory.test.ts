import { describe, expect, it } from "vitest";
import { cardDefinitionFromRow, groupInventoryCards, packLeagueId } from "./card-inventory";

describe("card inventory mapping", () => {
  it("resolve a pelada pelo escopo da rodada ou do Passe", () => {
    expect(packLeagueId({ round_scope: { league_id: "league-a" } })).toBe("league-a");
    expect(packLeagueId({ pass_reward: { season: { league_id: "league-b" } } })).toBe("league-b");
  });

  it("aceita relações singulares e em lista", () => {
    expect(cardDefinitionFromRow([{ slug: "custom", name: "Carta X", rarity: "COMMON" }])?.name).toBe("Carta X");
  });

  it("conta somente instâncias disponíveis", () => {
    const card = { id: "1", cardId: "card", slug: "custom", name: "Carta", description: "", rarity: "COMMON" as const, effectType: "NONE", effectConfig: {}, status: "OWNED" as const, acquiredAt: "now", consumedAt: null, icon: "x" };
    const grouped = groupInventoryCards([card, { ...card, id: "2", status: "CONSUMED" as const }]);
    expect(grouped.custom.count).toBe(1);
    expect(grouped.custom.instances).toHaveLength(2);
  });
});
