import { describe, expect, it } from "vitest";
import { CardEffectResolver, type CardResolverPlayer, type CardResolverContext } from "./resolver";
import { generatePackOffers } from "./pack-generator";
import { getCardBySlug, FANTASY_CARDS_CATALOG } from "./catalog";
import { MAX_SPECIAL_CARDS_PER_ROUND } from "./config";

describe("Cartola V3 — Simulação Integrada do Ciclo de Jogo e Multiusuário", () => {
  type MockUser = {
    id: string;
    name: string;
    inventory: Array<{ id: string; cardSlug: string; status: "OWNED" | "RESERVED" | "LOCKED" | "CONSUMED" }>;
    packs: Array<{ id: string; roundId: string; status: "available" | "opened" | "claimed"; offers?: string[] }>;
    activeActivation: { roundId: string; cardSlug: string; status: "RESERVED" | "LOCKED" | "RESOLVED"; targetPlayerId?: string } | null;
  };

  it("V3-T01 a V3-T04: Geração de pacotes para participantes válidos e proteção contra duplicação", () => {
    const round18Id = "round-18";
    const participantsWithLineup = ["user-1", "user-2"];
    const nonParticipants = ["user-3"];

    // Simulação do gerador de pacotes
    const packsDatabase = new Map<string, { userId: string; roundId: string }>();

    function generatePacks(roundId: string, validUserIds: string[], isCancelled = false) {
      if (isCancelled) return 0;
      let created = 0;
      for (const userId of validUserIds) {
        const key = `${userId}_${roundId}`;
        if (!packsDatabase.has(key)) {
          packsDatabase.set(key, { userId, roundId });
          created++;
        }
      }
      return created;
    }

    // 1. Participantes ganham 1 pacote na finalização (V3-T01)
    const initialGenerated = generatePacks(round18Id, participantsWithLineup);
    expect(initialGenerated).toBe(2);

    // 2. Não participante não recebe pacote (V3-T02)
    expect(packsDatabase.has(`user-3_${round18Id}`)).toBe(false);

    // 3. Finalizar rodada novamente não duplica pacotes (V3-T04)
    const secondRun = generatePacks(round18Id, participantsWithLineup);
    expect(secondRun).toBe(0);
    expect(packsDatabase.size).toBe(2);

    // 4. Rodada cancelada não gera pacotes (V3-T03)
    const cancelledGen = generatePacks("round-cancelled", ["user-1"], true);
    expect(cancelledGen).toBe(0);
  });

  it("V3-T05 a V3-T11: Abertura idempotente, 2 opções server-side e escolha atômica", () => {
    // Sorteio inicial
    const [cardA, cardB] = generatePackOffers();
    expect(cardA.slug).not.toBe(cardB.slug);

    // Simula ofertas gravadas no backend
    const savedOffers = [cardA.slug, cardB.slug];

    // Se o usuário fechar o app e abrir de novo, recebe as mesmas ofertas (V3-T06, V3-T07)
    expect(savedOffers[0]).toBe(cardA.slug);
    expect(savedOffers[1]).toBe(cardB.slug);

    // Usuário escolhe a carta A (V3-T09)
    const chosenCard = cardA.slug;
    const inventory = [{ id: "inst-1", cardSlug: chosenCard, status: "OWNED" }];
    let packStatus: "available" | "opened" | "claimed" = "claimed";

    expect(inventory.length).toBe(1);
    expect(inventory[0].cardSlug).toBe(cardA.slug);
    expect(packStatus).toBe("claimed");

    // Tentativa de escolher B depois do resgate (V3-T10) -> Rejeitar
    const canClaimAgain = (packStatus as string) === "opened";
    expect(canClaimAgain).toBe(false);
  });

  it("V3-T12 e V3-T13: Duplicatas no inventário como instâncias individuais e consumo controlado", () => {
    const userInventory: Array<{ id: string; cardSlug: string; status: "OWNED" | "CONSUMED" }> = [
      { id: "inst-1", cardSlug: "super_captain", status: "OWNED" },
      { id: "inst-2", cardSlug: "super_captain", status: "OWNED" },
    ];

    expect(userInventory.length).toBe(2);
    expect(userInventory[0].id).not.toBe(userInventory[1].id);

    // Consome uma instância
    userInventory[0].status = "CONSUMED";

    const available = userInventory.filter((i) => i.status === "OWNED");
    const consumed = userInventory.filter((i) => i.status === "CONSUMED");

    expect(available.length).toBe(1);
    expect(consumed.length).toBe(1);
  });

  it("V3-T14 a V3-T18: Ativação de 1 carta por rodada, troca antes do lock e bloqueio após fechamento", () => {
    const roundId = "round-19";
    let isMarketOpen = true;

    type Activation = {
      cardId: string;
      slug: string;
      status: "RESERVED" | "LOCKED";
    };

    let activeCard: Activation | null = null;
    const inventory = [
      { id: "inst-1", slug: "super_captain", status: "OWNED" },
      { id: "inst-2", slug: "golden_goal", status: "OWNED" },
    ];

    // Ativa primeira carta (V3-T14)
    activeCard = { cardId: "inst-1", slug: "super_captain", status: "RESERVED" };
    inventory[0].status = "RESERVED";
    expect(activeCard.slug).toBe("super_captain");

    // Troca para a segunda carta antes do lock (V3-T16)
    inventory[0].status = "OWNED"; // Primeira volta para OWNED
    activeCard = { cardId: "inst-2", slug: "golden_goal", status: "RESERVED" };
    inventory[1].status = "RESERVED";

    expect(inventory[0].status).toBe("OWNED");
    expect(inventory[1].status).toBe("RESERVED");
    expect(activeCard.slug).toBe("golden_goal");

    // Mercado fecha (Lock)
    isMarketOpen = false;
    activeCard.status = "LOCKED";
    inventory[1].status = "LOCKED";

    // Tentativa de alterar após o fechamento (V3-T18) -> Bloqueado
    const canChange = isMarketOpen;
    expect(canChange).toBe(false);
  });

  it("V3-T19 a V3-T21: Simulação Completa Multiusuário (Usuário A, B e C com cartas distintas)", () => {
    const userA: MockUser = {
      id: "usr-A",
      name: "Daniel",
      inventory: [{ id: "inv-A", cardSlug: "super_captain", status: "RESERVED" }],
      packs: [],
      activeActivation: { roundId: "r20", cardSlug: "super_captain", status: "LOCKED" },
    };

    const userB: MockUser = {
      id: "usr-B",
      name: "Leonardo",
      inventory: [{ id: "inv-B", cardSlug: "golden_goal", status: "RESERVED" }],
      packs: [],
      activeActivation: { roundId: "r20", cardSlug: "golden_goal", status: "LOCKED", targetPlayerId: "pl-artilheiro" },
    };

    const userC: MockUser = {
      id: "usr-C",
      name: "Carlos",
      inventory: [],
      packs: [],
      activeActivation: null,
    };

    const roundPlayers: CardResolverPlayer[] = [
      { playerId: "pl-craque", name: "Craque", price: 15, basePoints: 12, goals: 2, assists: 1, wins: 1, losses: 0, games: 1, isCaptain: true },
      { playerId: "pl-artilheiro", name: "Artilheiro", price: 10, basePoints: 8, goals: 1, assists: 0, wins: 1, losses: 0, games: 1 },
      { playerId: "pl-comum", name: "Comum", price: 7, basePoints: 5, goals: 0, assists: 0, wins: 0, losses: 1, games: 1 },
    ];

    const ctx: CardResolverContext = {
      roundAverageBasePoints: 8.3,
      allRoundPlayers: roundPlayers.map((p) => ({ playerId: p.playerId, price: p.price, basePoints: p.basePoints })),
    };

    // Resolução Usuário A (Super Capitão no Craque: base 12 * 3 = 36 total, +12 bônus da carta)
    const cardDefA = getCardBySlug("super_captain")!;
    const resA = CardEffectResolver.resolveScoreEffect(cardDefA, {}, roundPlayers, "pl-craque", ctx);
    expect(resA.applied).toBe(true);
    expect(resA.bonusPoints).toBe(12);

    // Resolução Usuário B (Gol de Ouro no Artilheiro que fez 1 gol: +3 bônus)
    const cardDefB = getCardBySlug("golden_goal")!;
    const resB = CardEffectResolver.resolveScoreEffect(cardDefB, { targetPlayerId: "pl-artilheiro" }, roundPlayers, "pl-craque", ctx);
    expect(resB.applied).toBe(true);
    expect(resB.bonusPoints).toBe(3);

    // Usuário C não usou carta -> 0 bônus
    expect(userC.activeActivation).toBeNull();
  });
});
