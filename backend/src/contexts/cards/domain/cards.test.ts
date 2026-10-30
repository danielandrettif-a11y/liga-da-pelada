import { describe, expect, it } from "vitest";
import {
  validateCardActivation,
  validatePackClaim,
  type FantasyCardDefinition,
  type FantasyPackDTO,
} from "./cards.js";

describe("Cards Domain", () => {
  const sampleCard: FantasyCardDefinition = {
    slug: "luva-de-ouro",
    name: "Luva de Ouro",
    description: "Dobra pontos de clean sheet",
    rarity: "rare",
    cost: 0,
    requiresTargetPlayer: true,
  };

  it("blocks card activation if round is closed", () => {
    const result = validateCardActivation({
      cardDefinition: sampleCard,
      targetPlayerId: "p1",
      isRoundOpen: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("rodada já iniciou");
  });

  it("blocks activation if required target player is missing", () => {
    const result = validateCardActivation({
      cardDefinition: sampleCard,
      targetPlayerId: null,
      isRoundOpen: true,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exige a escolha de um atleta-alvo");
  });

  it("allows activation with target player when round is open", () => {
    const result = validateCardActivation({
      cardDefinition: sampleCard,
      targetPlayerId: "p1",
      isRoundOpen: true,
    });
    expect(result.valid).toBe(true);
  });

  it("validates pack claim choices", () => {
    const pack: FantasyPackDTO = {
      id: "pack-1",
      userId: "u1",
      leagueId: "l1",
      status: "opened",
      cardSlugOffer1: "card-a",
      cardSlugOffer2: "card-b",
      createdAt: new Date().toISOString(),
    };

    expect(validatePackClaim({ pack, chosenSlug: "card-c" }).valid).toBe(false);
    expect(validatePackClaim({ pack, chosenSlug: "card-a" }).valid).toBe(true);

    const claimedPack: FantasyPackDTO = { ...pack, status: "claimed" };
    expect(validatePackClaim({ pack: claimedPack, chosenSlug: "card-a" }).valid).toBe(false);
  });
});
