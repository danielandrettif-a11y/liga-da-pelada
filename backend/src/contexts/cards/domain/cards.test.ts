import { describe, expect, it } from "vitest";
import {
  validateCardActivation,
  validatePackClaim,
  type FantasyCardDefinition,
  type FantasyPackDTO,
} from "./cards.js";

describe("Cards Domain", () => {
  const sampleCard: FantasyCardDefinition = {
    slug: "golden_goal",
    name: "Luva de Ouro",
    description: "Dobra pontos de clean sheet",
    rarity: "RARE",
    effectType: "CONDITIONAL_PLAYER_BONUS",
    effectConfig: {},
    enabled: true,
    icon: "🃏",
    requiresTarget: "SINGLE_PLAYER",
  };

  it("blocks card activation if round is closed", () => {
    const result = validateCardActivation({
      cardDefinition: sampleCard,
      targetPlayerId: "p1",
      isRoundOpen: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("mercado já está fechado");
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

  it("requires both targets for duo cards", () => {
    const duoCard: FantasyCardDefinition = {
      ...sampleCard,
      slug: "double_prediction",
      requiresTarget: "DUO_PLAYERS",
    };

    expect(validateCardActivation({
      cardDefinition: duoCard,
      targetPlayerId: "p1",
      isRoundOpen: true,
    }).valid).toBe(false);
    expect(validateCardActivation({
      cardDefinition: duoCard,
      targetPlayerId: "p1",
      targetPlayer2Id: "p2",
      isRoundOpen: true,
    }).valid).toBe(true);
  });

  it("validates pack claim choices", () => {
    const pack: FantasyPackDTO = {
      id: "pack-1",
      roundId: "r1",
      status: "opened",
      openedAt: null,
      chosenCardId: null,
      createdAt: new Date().toISOString(),
      offers: ["card-a", "card-b"].map((slug, index) => ({ slot: index + 1, card: { ...sampleCard, slug } })),
    };

    expect(validatePackClaim({ pack, chosenSlug: "card-c" }).valid).toBe(false);
    expect(validatePackClaim({ pack, chosenSlug: "card-a" }).valid).toBe(true);

    const claimedPack: FantasyPackDTO = { ...pack, status: "claimed" };
    expect(validatePackClaim({ pack: claimedPack, chosenSlug: "card-a" }).valid).toBe(false);
  });
});

