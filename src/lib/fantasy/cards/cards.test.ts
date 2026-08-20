import { describe, expect, it } from "vitest";
import { CardEffectResolver, type CardResolverPlayer, type CardResolverContext } from "./resolver";
import { generatePackOffers, rollRarity } from "./pack-generator";
import { FANTASY_CARDS_CATALOG, getCardBySlug } from "./catalog";
import { MAX_SPECIAL_CARDS_PER_ROUND, FANTASY_RARITY_PROBABILITIES } from "./config";

describe("Cartola V3 — Catálogo & Probabilidades", () => {
  it("contém todas as 10 cartas oficiais habilitadas", () => {
    const enabled = FANTASY_CARDS_CATALOG.filter((c) => c.enabled);
    expect(enabled.length).toBe(10);

    const slugs = enabled.map((c) => c.slug);
    expect(slugs).toContain("super_captain");
    expect(slugs).toContain("extra_credit");
    expect(slugs).toContain("double_prediction");
    expect(slugs).toContain("bargain");
    expect(slugs).toContain("vice_captain");
    expect(slugs).toContain("golden_goal");
    expect(slugs).toContain("golden_assist");
    expect(slugs).toContain("scout");
    expect(slugs).toContain("duo");
    expect(slugs).toContain("all_in");
  });

  it("garante soma 100% nas probabilidades de raridade", () => {
    const sum = Object.values(FANTASY_RARITY_PROBABILITIES).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });

  it("sorteia 2 cartas diferentes por pacote (V3-T05)", () => {
    for (let i = 0; i < 50; i++) {
      const [c1, c2] = generatePackOffers();
      expect(c1.slug).not.toBe(c2.slug);
    }
  });

  it("respeita a regra de no máximo 1 carta ativa por rodada", () => {
    expect(MAX_SPECIAL_CARDS_PER_ROUND).toBe(1);
  });
});

describe("Cartola V3 — Resolução das 10 Cartas Especiais", () => {
  const dummyContext: CardResolverContext = {
    roundAverageBasePoints: 9.0,
    allRoundPlayers: [
      { playerId: "p1", price: 15, basePoints: 14 },
      { playerId: "p2", price: 12, basePoints: 12 },
      { playerId: "p3", price: 10, basePoints: 10 },
      { playerId: "p4", price: 8, basePoints: 9 },
      { playerId: "p5", price: 6, basePoints: 8 }, // 5º lugar (empate ou corte)
      { playerId: "p6", price: 5, basePoints: 8 }, // 5º lugar empatado
      { playerId: "p7", price: 7, basePoints: 6 }, // 7º lugar
    ],
    predictionsResults: {
      topScorerHit: true,
      topScorerReward: 8,
      topAssistHit: false,
      topAssistReward: 8,
      challengeHit: true,
      challengeReward: 6,
    },
  };

  // 1. Super Capitão
  it("CARTA 1: Super Capitão (3x total)", () => {
    const card = getCardBySlug("super_captain")!;
    const players: CardResolverPlayer[] = [
      { playerId: "p1", name: "Craque", price: 15, basePoints: 10, goals: 1, assists: 1, wins: 1, losses: 0, games: 1, isCaptain: true },
    ];
    const res = CardEffectResolver.resolveScoreEffect(card, {}, players, "p1", dummyContext);

    expect(res.applied).toBe(true);
    // A arte atual limita em +8 o bônus adicional da carta.
    expect(res.bonusPoints).toBe(8);
    expect(res.captainMultiplierOverride).toBe(3);
  });

  // 2. Crédito Extra
  it("CARTA 2: Crédito Extra (+C$ 5 sem alterar pontuação)", () => {
    const card = getCardBySlug("extra_credit")!;
    const res = CardEffectResolver.resolveScoreEffect(card, {}, [], null, dummyContext);
    expect(res.applied).toBe(true);
    expect(res.bonusPoints).toBe(0);
    expect(res.budgetBonus).toBe(5);
  });

  // 3. Palpite Duplo
  it("CARTA 3: Palpite Duplo (+6 somente se gol e assistência forem acertados)", () => {
    const card = getCardBySlug("double_prediction")!;

    const hitRes = CardEffectResolver.resolveScoreEffect(card, {}, [], null, {
      ...dummyContext,
      predictionsResults: { ...dummyContext.predictionsResults, topAssistHit: true },
    });
    expect(hitRes.applied).toBe(true);
    expect(hitRes.bonusPoints).toBe(6);

    // Errou garçom -> 0 bônus
    const missRes = CardEffectResolver.resolveScoreEffect(card, {}, [], null, dummyContext);
    expect(missRes.applied).toBe(false);
    expect(missRes.bonusPoints).toBe(0);
  });

  // 4. Barganha
  it("CARTA 4: Barganha (20% de desconto para montagem)", () => {
    const card = getCardBySlug("bargain")!;
    const players: CardResolverPlayer[] = [
      { playerId: "p1", name: "Estrela", price: 15, basePoints: 8, goals: 0, assists: 0, wins: 1, losses: 0, games: 1 },
    ];
    const res = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "p1" }, players, null, dummyContext);
    expect(res.applied).toBe(true);
    expect(res.playerDiscountPercent).toBe(20);
    expect(res.discountedPlayerId).toBe("p1");
  });

  // 5. Vice-Capitão
  it("CARTA 5: Vice-Capitão (ativa se superar o capitão, com teto de +8)", () => {
    const card = getCardBySlug("vice_captain")!;

    // Caso A: Titular não jogou (games = 0)
    const playersA: CardResolverPlayer[] = [
      { playerId: "cap", name: "Titular", price: 15, basePoints: 0, goals: 0, assists: 0, wins: 0, losses: 0, games: 0, isCaptain: true },
      { playerId: "vice", name: "Substituto", price: 10, basePoints: 10, goals: 1, assists: 0, wins: 1, losses: 0, games: 1 },
    ];
    const resA = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "vice" }, playersA, "cap", dummyContext);
    expect(resA.applied).toBe(true);
    expect(resA.viceCaptainActivated).toBe(true);
    expect(resA.bonusPoints).toBe(8);

    // Caso intermediário: remove o bônus do capitão (6) e passa o 2x ao vice (10).
    const playersSwap: CardResolverPlayer[] = [
      { playerId: "cap", name: "Titular", price: 15, basePoints: 6, goals: 0, assists: 0, wins: 1, losses: 0, games: 1, isCaptain: true },
      { playerId: "vice", name: "Substituto", price: 10, basePoints: 10, goals: 1, assists: 0, wins: 1, losses: 0, games: 1 },
    ];
    const resSwap = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "vice" }, playersSwap, "cap", dummyContext);
    expect(resSwap.applied).toBe(true);
    expect(resSwap.bonusPoints).toBe(4);

    // Caso B: capitão pontuou mais do que o vice -> não ativa.
    const playersB: CardResolverPlayer[] = [
      { playerId: "cap", name: "Titular", price: 15, basePoints: 12, goals: 1, assists: 1, wins: 1, losses: 0, games: 1, isCaptain: true },
      { playerId: "vice", name: "Substituto", price: 10, basePoints: 10, goals: 1, assists: 0, wins: 1, losses: 0, games: 1 },
    ];
    const resB = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "vice" }, playersB, "cap", dummyContext);
    expect(resB.applied).toBe(false);
    expect(resB.viceCaptainActivated).toBe(false);
    expect(resB.bonusPoints).toBe(0);
  });

  // 6. Gol de Ouro
  it("CARTA 6: Gol de Ouro (+3 com 1+ gol; 0 se não marcar; não multiplica com mais gols)", () => {
    const card = getCardBySlug("golden_goal")!;
    const playerWithGoal: CardResolverPlayer[] = [
      { playerId: "p1", name: "Artilheiro", price: 10, basePoints: 8, goals: 3, assists: 0, wins: 1, losses: 0, games: 1 },
    ];
    const playerNoGoal: CardResolverPlayer[] = [
      { playerId: "p2", name: "Zagueiro", price: 8, basePoints: 4, goals: 0, assists: 0, wins: 1, losses: 0, games: 1 },
    ];

    const res1 = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "p1" }, playerWithGoal, null, dummyContext);
    expect(res1.applied).toBe(true);
    expect(res1.bonusPoints).toBe(3);

    const res2 = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "p2" }, playerNoGoal, null, dummyContext);
    expect(res2.applied).toBe(false);
    expect(res2.bonusPoints).toBe(0);
  });

  // 7. Passe de Ouro
  it("CARTA 7: Passe de Ouro (+3 com 1+ assistência)", () => {
    const card = getCardBySlug("golden_assist")!;
    const players: CardResolverPlayer[] = [
      { playerId: "p1", name: "Meia", price: 10, basePoints: 7, goals: 0, assists: 2, wins: 1, losses: 0, games: 1 },
    ];
    const res = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "p1" }, players, null, dummyContext);
    expect(res.applied).toBe(true);
    expect(res.bonusPoints).toBe(3);
  });

  // 8. Caça-Talentos
  it("CARTA 8: Caça-Talentos (50% dos pontos base com teto de +6)", () => {
    const card = getCardBySlug("scout")!;

    // 10 pts -> 50% = 5 pts
    const p1: CardResolverPlayer[] = [
      { playerId: "p1", name: "Jovem", price: 7, basePoints: 10, goals: 1, assists: 0, wins: 1, losses: 0, games: 1 },
    ];
    const res1 = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "p1" }, p1, null, dummyContext);
    expect(res1.bonusPoints).toBe(5);

    // 20 pts -> 50% seria 10, mas bate no teto de +6
    const p2: CardResolverPlayer[] = [
      { playerId: "p6", name: "Destaque Barato", price: 5, basePoints: 20, goals: 3, assists: 1, wins: 1, losses: 0, games: 1 },
    ];
    const res2 = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "p6" }, p2, null, dummyContext);
    expect(res2.bonusPoints).toBe(6);
  });

  it("Caça-Talentos e All-In aceitam qualquer escalado quando todos começam no mesmo preço", () => {
    const equalPriceContext: CardResolverContext = {
      ...dummyContext,
      allRoundPlayers: [
        { playerId: "p1", price: 10, basePoints: 12 },
        { playerId: "p2", price: 10, basePoints: 8 },
        { playerId: "p3", price: 10, basePoints: 4 },
      ],
    };
    const player: CardResolverPlayer[] = [
      { playerId: "p1", name: "Primeira rodada", price: 10, basePoints: 12, goals: 1, assists: 0, wins: 1, losses: 0, games: 1 },
    ];
    const scout = CardEffectResolver.resolveScoreEffect(getCardBySlug("scout")!, { targetPlayerId: "p1" }, player, null, equalPriceContext);
    const allIn = CardEffectResolver.resolveScoreEffect(getCardBySlug("all_in")!, { targetPlayerId: "p1" }, player, null, equalPriceContext);
    expect(scout.applied).toBe(true);
    expect(allIn.applied).toBe(true);
  });

  // 9. Dobradinha
  it("CARTA 9: Dobradinha (+5 se ambos ficarem acima da média da rodada 9.0)", () => {
    const card = getCardBySlug("duo")!;

    // Ambos acima (12 e 10 >= 9.0) -> +5
    const successDuo: CardResolverPlayer[] = [
      { playerId: "p1", name: "Daniel", price: 12, basePoints: 12, goals: 1, assists: 1, wins: 1, losses: 0, games: 1 },
      { playerId: "p2", name: "João", price: 10, basePoints: 10, goals: 1, assists: 0, wins: 1, losses: 0, games: 1 },
    ];
    const resSuccess = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "p1", targetPlayer2Id: "p2" }, successDuo, null, dummyContext);
    expect(resSuccess.applied).toBe(true);
    expect(resSuccess.bonusPoints).toBe(5);

    // Um abaixo (12 e 8) -> 0
    const failDuo: CardResolverPlayer[] = [
      { playerId: "p1", name: "Daniel", price: 12, basePoints: 12, goals: 1, assists: 1, wins: 1, losses: 0, games: 1 },
      { playerId: "p2", name: "João", price: 10, basePoints: 8, goals: 0, assists: 1, wins: 1, losses: 0, games: 1 },
    ];
    const resFail = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "p1", targetPlayer2Id: "p2" }, failDuo, null, dummyContext);
    expect(resFail.applied).toBe(false);
    expect(resFail.bonusPoints).toBe(0);
  });

  // 10. All-In
  it("CARTA 10: All-In (+6 se terminar no TOP 5 da rodada com empate justo)", () => {
    const card = getCardBySlug("all_in")!;

    // Jogador p5 fez 8 pts e empatou no 5º lugar -> Válido (+6)
    const p5: CardResolverPlayer[] = [
      { playerId: "p5", name: "Barato Bom", price: 6, basePoints: 8, goals: 1, assists: 0, wins: 1, losses: 0, games: 1 },
    ];
    const resTop5 = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "p5" }, p5, null, dummyContext);
    expect(resTop5.applied).toBe(true);
    expect(resTop5.bonusPoints).toBe(6);

    // Jogador p7 fez 6 pts e ficou em 7º lugar -> Não atinge TOP 5 (0 pts)
    const p7: CardResolverPlayer[] = [
      { playerId: "p7", name: "Barato Ruim", price: 5, basePoints: 6, goals: 0, assists: 0, wins: 0, losses: 1, games: 1 },
    ];
    const resTop7 = CardEffectResolver.resolveScoreEffect(card, { targetPlayerId: "p7" }, p7, null, dummyContext);
    expect(resTop7.applied).toBe(false);
    expect(resTop7.bonusPoints).toBe(0);
  });
});
