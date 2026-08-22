import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS } from "./config";
import {
  calculateCostBenefit,
  calculateFantasyForm,
  calculateFantasyPlayerPoints,
  calculateFantasyPrices,
  calculateFantasyTrend,
  calculateMarketPopularity,
  getFantasyPlayerTags,
  predictionIsCorrect,
  roundMoney,
  validateFantasyDraft,
} from "./engine";
import { fantasyChallengeIsCorrect, fantasyChallengeOffer, fantasyPriceBand } from "./challenges";

describe("Cartola V2 — Suíte de Testes e Validação Econômica", () => {
  const prices = new Map(["a", "b", "c", "d", "e", "f"].map((id) => [id, 10]));

  describe("Validação de Escalação e Orçamento (V1 + V2)", () => {
    it("valida rascunhos, cinco jogadores, capitão e orçamento", () => {
      expect(
        validateFantasyDraft({ playerIds: ["a", "b", "c", "d"], captainPlayerId: "a", prices, budget: 55 })
      ).toMatchObject({ valid: true, complete: false });
      expect(
        validateFantasyDraft({ playerIds: ["a", "b", "c", "d", "e"], captainPlayerId: "a", prices, budget: 55 })
      ).toMatchObject({ valid: true, complete: true, cost: 50 });
      expect(
        validateFantasyDraft({ playerIds: ["a", "b", "c", "d", "e", "f"], captainPlayerId: "a", prices, budget: 100 })
          .valid
      ).toBe(false);
      expect(validateFantasyDraft({ playerIds: ["a", "a"], prices, budget: 55 }).valid).toBe(false);
      expect(validateFantasyDraft({ playerIds: ["a"], captainPlayerId: "b", prices, budget: 55 }).valid).toBe(false);
      expect(
        validateFantasyDraft({ playerIds: ["a", "b", "c", "d", "e"], captainPlayerId: "a", prices, budget: 49 }).valid
      ).toBe(false);
    });

    it("calcula gol (+5), assistência (+3), vitória (+4), derrota de linha (-2) e goleiro", () => {
      expect(calculateFantasyPlayerPoints({ goals: 2, assists: 1, wins: 2, losses: 0 }, DEFAULT_FANTASY_SETTINGS)).toBe(
        21
      );
      expect(calculateFantasyPlayerPoints({ goals: 0, assists: 0, wins: 0, losses: 3 }, DEFAULT_FANTASY_SETTINGS)).toBe(
        -6
      );
      expect(calculateFantasyPlayerPoints({ goals: 0, assists: 0, wins: 0, losses: 0, goalkeeperGames: 2, goalsConceded: 9, teamGoalsConceded: 3 }, DEFAULT_FANTASY_SETTINGS)).toBe(3);
      expect(calculateFantasyPlayerPoints({ goals: 0, assists: 0, wins: 0, losses: 0, teamGoalsConceded: 2 }, DEFAULT_FANTASY_SETTINGS)).toBe(-2);
      expect(calculateFantasyPlayerPoints({ goals: 0, assists: 0, wins: 0, losses: 2, goalkeeperGames: 1 }, DEFAULT_FANTASY_SETTINGS)).toBe(3);
    });
  });

  describe("Valorização e Economia de Mercado (V2-T01 a V2-T11)", () => {
    // V2-T01: Jogador muito acima da média da rodada -> valoriza
    it("V2-T01: Jogador muito acima da média da rodada valoriza", () => {
      const results = calculateFantasyPrices([
        { playerId: "a", games: 3, wins: 3, draws: 0, goals: 3, assists: 2, recentPoints: [15, 18], seasonPoints: [15, 18], currentPrice: 12.0 },
        { playerId: "b", games: 3, wins: 1, draws: 1, goals: 0, assists: 0, recentPoints: [5, 4], seasonPoints: [5, 4], currentPrice: 10.0 },
        { playerId: "c", games: 3, wins: 0, draws: 0, goals: 0, assists: 0, recentPoints: [0, 2], seasonPoints: [0, 2], currentPrice: 10.0 },
      ], DEFAULT_FANTASY_SETTINGS);

      const playerA = results.find((r) => r.playerId === "a")!;
      expect(playerA.variationRate).toBeGreaterThan(0);
      expect(playerA.nextPrice).toBeGreaterThan(12.0);
    });

    // V2-T02: Jogador próximo da média -> variação neutra/pequena
    it("V2-T02: Jogador com desempenho mediano recebe variação pequena/neutra", () => {
      const results = calculateFantasyPrices([
        { playerId: "a", games: 3, wins: 3, draws: 0, goals: 3, assists: 0, recentPoints: [12, 12], seasonPoints: [12, 12], currentPrice: 12.0 },
        { playerId: "b", games: 3, wins: 1, draws: 1, goals: 1, assists: 1, recentPoints: [8, 8], seasonPoints: [8, 8], currentPrice: 10.0 },
        { playerId: "c", games: 3, wins: 0, draws: 0, goals: 0, assists: 0, recentPoints: [0, 0], seasonPoints: [0, 0], currentPrice: 8.0 },
      ], DEFAULT_FANTASY_SETTINGS);

      const playerB = results.find((r) => r.playerId === "b")!;
      expect(Math.abs(playerB.variationRate)).toBeLessThanOrEqual(0.06);
    });

    // V2-T03: Jogador muito abaixo da média -> desvaloriza
    it("V2-T03: Jogador muito abaixo da média desvaloriza", () => {
      const results = calculateFantasyPrices([
        { playerId: "a", games: 3, wins: 3, draws: 0, goals: 3, assists: 2, recentPoints: [15, 18], seasonPoints: [15, 18], currentPrice: 15.0 },
        { playerId: "b", games: 3, wins: 0, draws: 0, losses: 3, goals: 0, assists: 0, recentPoints: [-1, 0], seasonPoints: [-1, 0], currentPrice: 12.0 },
      ], DEFAULT_FANTASY_SETTINGS);

      const playerB = results.find((r) => r.playerId === "b")!;
      expect(playerB.variationRate).toBeLessThan(0);
      expect(playerB.nextPrice).toBeLessThan(12.0);
    });

    // V2-T04 e V2-T05: Limites máximos de valorização (+12%) e desvalorização (-10%)
    it("V2-T04 e V2-T05: Respeita limites máximos de variação (+12% e -10%)", () => {
      const results = calculateFantasyPrices([
        { playerId: "super", games: 5, wins: 5, draws: 0, goals: 10, assists: 5, recentPoints: [30, 40], seasonPoints: [30, 40], currentPrice: 10.0 },
        { playerId: "horrible", games: 5, wins: 0, draws: 0, losses: 5, goals: 0, assists: 0, recentPoints: [-5, -5], seasonPoints: [-5, -5], currentPrice: 10.0 },
      ], DEFAULT_FANTASY_SETTINGS);

      const superPlayer = results.find((r) => r.playerId === "super")!;
      const horriblePlayer = results.find((r) => r.playerId === "horrible")!;

      expect(superPlayer.variationRate).toBeLessThanOrEqual(DEFAULT_FANTASY_SETTINGS.maxPriceIncrease + 0.0001);
      expect(horriblePlayer.variationRate).toBeGreaterThanOrEqual(-DEFAULT_FANTASY_SETTINGS.maxPriceDecrease - 0.0001);
    });

    // V2-T06 e V2-T07: Piso (C$ 5,00) e Teto (C$ 25,00)
    it("V2-T06 e V2-T07: Preço nunca cai abaixo de C$ 5 nem ultrapassa C$ 25", () => {
      const results = calculateFantasyPrices([
        { playerId: "top", games: 3, wins: 3, draws: 0, goals: 4, assists: 2, recentPoints: [20], seasonPoints: [20], currentPrice: 24.90 },
        { playerId: "bottom", games: 3, wins: 0, draws: 0, losses: 3, goals: 0, assists: 0, recentPoints: [-3], seasonPoints: [-3], currentPrice: 5.10 },
      ], DEFAULT_FANTASY_SETTINGS);

      const topPlayer = results.find((r) => r.playerId === "top")!;
      const bottomPlayer = results.find((r) => r.playerId === "bottom")!;

      expect(topPlayer.nextPrice).toBeLessThanOrEqual(DEFAULT_FANTASY_SETTINGS.maxPlayerPrice);
      expect(bottomPlayer.nextPrice).toBeGreaterThanOrEqual(DEFAULT_FANTASY_SETTINGS.minPlayerPrice);
    });

    // V2-T08 e V2-T09: Bayesian Smoothing no aproveitamento
    it("V2-T08 e V2-T09: Suavização Bayesiana evita distorção de 1 jogo 100%", () => {
      const results = calculateFantasyPrices([
        // Jogador A: 1 jogo, 1 vitória (100% bruto, mas amostra pequena)
        { playerId: "oneGame", games: 1, wins: 1, draws: 0, goals: 1, assists: 0, recentPoints: [7], seasonPoints: [7], currentPrice: 10.0 },
        // Jogador B: 20 jogos, 15 vitórias (75% consistente, grande amostra)
        { playerId: "consistent", games: 3, wins: 2, draws: 1, goals: 2, assists: 1, recentPoints: [14, 12, 15], seasonPoints: [14, 12, 15, 13, 11], currentPrice: 15.0 },
      ], DEFAULT_FANTASY_SETTINGS);

      const consistent = results.find((r) => r.playerId === "consistent")!;
      const oneGame = results.find((r) => r.playerId === "oneGame")!;

      // O jogador consistente com grande volume histórico recebe maior pontuação/score
      expect(consistent.score).toBeGreaterThan(oneGame.score);
    });

    // V2-T10: Jogador que não participou da rodada -> Preço fica 100% ESTÁVEL
    it("V2-T10: Jogador ausente (não jogou) mantém preço 100% estável (variação 0.00%)", () => {
      const results = calculateFantasyPrices([
        { playerId: "active1", games: 3, wins: 2, draws: 0, goals: 2, assists: 1, recentPoints: [10], seasonPoints: [10], currentPrice: 14.20 },
        { playerId: "active2", games: 3, wins: 0, draws: 0, losses: 3, goals: 0, assists: 0, recentPoints: [-2], seasonPoints: [-2], currentPrice: 8.50 },
        { playerId: "absent", games: 0, wins: 0, draws: 0, goals: 0, assists: 0, recentPoints: [12, 10], seasonPoints: [12, 10], currentPrice: 13.50 },
      ], DEFAULT_FANTASY_SETTINGS);

      const absent = results.find((r) => r.playerId === "absent")!;
      expect(absent.variationRate).toBe(0);
      expect(absent.nextPrice).toBe(13.50);
      expect(absent.roundPoints).toBe(0);
    });

    // V2-T11: Jogador que participou e fez 0 pontos é tratado diferente de ausente
    it("V2-T11: Jogador que jogou e fez 0 pontos é desvalorizado (diferente de ausência)", () => {
      const results = calculateFantasyPrices([
        { playerId: "activeGood", games: 3, wins: 3, draws: 0, goals: 3, assists: 0, recentPoints: [15], seasonPoints: [15], currentPrice: 12.0 },
        { playerId: "playedZero", games: 3, wins: 0, draws: 0, losses: 3, goals: 0, assists: 0, recentPoints: [0], seasonPoints: [0], currentPrice: 12.0 },
        { playerId: "absent", games: 0, wins: 0, draws: 0, goals: 0, assists: 0, recentPoints: [10], seasonPoints: [10], currentPrice: 12.0 },
      ], DEFAULT_FANTASY_SETTINGS);

      const playedZero = results.find((r) => r.playerId === "playedZero")!;
      const absent = results.find((r) => r.playerId === "absent")!;

      expect(absent.nextPrice).toBe(12.0); // Estável
      expect(playedZero.nextPrice).toBeLessThan(12.0); // Desvalorizou
      expect(playedZero.variationRate).toBeLessThan(0);
    });
  });

  describe("Idempotência e Integridade de Patrimônio (V2-T12 a V2-T19)", () => {
    // V2-T12: Idempotência do cálculo
    it("V2-T12: Executar o cálculo duas vezes com os mesmos dados produz resultado idêntico", () => {
      const input = [
        { playerId: "a", games: 3, wins: 2, draws: 1, goals: 2, assists: 1, recentPoints: [12, 10], seasonPoints: [12, 10], currentPrice: 11.50 },
        { playerId: "b", games: 3, wins: 0, draws: 0, losses: 3, goals: 0, assists: 0, recentPoints: [-1, 2], seasonPoints: [-1, 2], currentPrice: 9.00 },
      ];

      const run1 = calculateFantasyPrices(input, DEFAULT_FANTASY_SETTINGS);
      const run2 = calculateFantasyPrices(input, DEFAULT_FANTASY_SETTINGS);

      expect(run1).toEqual(run2);
    });

    // V2-T16 e V2-T17: Patrimônio acompanha valorização e desvalorização
    it("V2-T16 e V2-T17: Patrimônio do usuário reflete soma do saldo restante + preços pós-rodada", () => {
      const initialBudget = 55.0;
      const initialLineupCost = 50.0;
      const cashRemaining = initialBudget - initialLineupCost; // 5.00

      // Caso 1: Jogadores valorizam (+C$ 4,20 no total)
      const afterPricesGain = [12.0, 11.5, 10.7, 10.0, 10.0]; // Total = 54.20
      const newPortfolioGain = cashRemaining + afterPricesGain.reduce((a, b) => a + b, 0);
      expect(newPortfolioGain).toBe(59.20);

      // Caso 2: Jogadores desvalorizam (-C$ 3,50 no total)
      const afterPricesDrop = [9.0, 9.5, 9.0, 9.5, 9.5]; // Total = 46.50
      const newPortfolioDrop = cashRemaining + afterPricesDrop.reduce((a, b) => a + b, 0);
      expect(newPortfolioDrop).toBe(51.50);
    });

    // V2-T18 e V2-T19: Compra e venda mantêm saldo estritamente consistente
    it("V2-T18 e V2-T19: Compras e vendas mantêm conservação monetária e não criam dinheiro", () => {
      let userCash = 55.0;
      const p1Price = 12.45;
      const p2Price = 8.35;

      // Compra P1
      userCash = roundMoney(userCash - p1Price);
      expect(userCash).toBe(42.55);

      // Compra P2
      userCash = roundMoney(userCash - p2Price);
      expect(userCash).toBe(34.20);

      // Vende P1
      userCash = roundMoney(userCash + p1Price);
      expect(userCash).toBe(46.65);

      // Vende P2
      userCash = roundMoney(userCash + p2Price);
      expect(userCash).toBe(55.00); // Exatamente o saldo inicial!
    });
  });

  describe("Tendências, Forma, Custo-Benefício e Tags (V2-T22)", () => {
    it("calcula tendência Em Alta (2+ valorizações), Em Baixa e Estável", () => {
      expect(calculateFantasyTrend([0.05, 0.08, 0.02])).toMatchObject({ trend: "UP", label: "Em Alta" });
      expect(calculateFantasyTrend([-0.04, -0.06, 0.01])).toMatchObject({ trend: "DOWN", label: "Em Baixa" });
      expect(calculateFantasyTrend([0.05, -0.04, 0.01])).toMatchObject({ trend: "STABLE", label: "Estável" });
    });

    it("calcula forma recente categorizada por faixas de pontuação", () => {
      expect(calculateFantasyForm([16, 18, 15]).form).toBe("EXCELLENT");
      expect(calculateFantasyForm([12, 10, 11]).form).toBe("GOOD");
      expect(calculateFantasyForm([6, 8, 7]).form).toBe("REGULAR");
      expect(calculateFantasyForm([3, 4, 3]).form).toBe("POOR");
      expect(calculateFantasyForm([0, 1, 2]).form).toBe("TERRIBLE");
    });

    it("calcula custo-benefício com score normalizado e formatado", () => {
      const cb = calculateCostBenefit(12.0, 10.0); // 1.2 pts/C$
      expect(cb.ratio).toBe(1.2);
      expect(cb.score).toBeGreaterThanOrEqual(8.0);
      expect(cb.formattedRatio).toBe("1,20 pts/C$");
    });

    it("gera tags prioritárias com limite de 2 tags para o card compacto", () => {
      const { allTags, compactTags } = getFantasyPlayerTags({
        price: 9.50,
        totalPoints: 48,
        roundsPlayed: 4,
        recentPoints: [14, 12, 15],
        recentVariations: [0.08, 0.06],
        goals: 4,
        assists: 3,
        popularityPercent: 65,
        captainPercent: 30,
        isMostSelected: true,
      });

      expect(allTags.length).toBeGreaterThan(2);
      expect(compactTags.length).toBeLessThanOrEqual(2);
      // Mais Escalado deve ter prioridade máxima (priority 1)
      expect(compactTags[0].type).toBe("MOST_SELECTED");
    });

    it("reconhece jogador Revelação (barato com boa forma)", () => {
      const { allTags } = getFantasyPlayerTags({
        price: 10.50,
        totalPoints: 36,
        roundsPlayed: 3,
        recentPoints: [12, 14, 13],
        recentVariations: [0.06, 0.08],
        goals: 3,
        assists: 2,
      });
      expect(allTags.some((t) => t.type === "REVELATION")).toBe(true);
    });
  });

  describe("Popularidade, Capitães, Mais Comprado/Vendido e Radar", () => {
    it("calcula % escalado e % capitão com precisão", () => {
      const currentLineups = [
        { userId: "u1", playerIds: ["daniel", "leo", "p3", "p4", "p5"], captainPlayerId: "daniel" },
        { userId: "u2", playerIds: ["daniel", "p2", "p3", "p4", "p5"], captainPlayerId: "daniel" },
        { userId: "u3", playerIds: ["daniel", "leo", "p3", "p4", "p5"], captainPlayerId: "daniel" },
        { userId: "u4", playerIds: ["daniel", "p2", "p3", "p4", "p5"], captainPlayerId: "p2" },
        { userId: "u5", playerIds: ["daniel", "leo", "p3", "p4", "p5"], captainPlayerId: "p3" },
        { userId: "u6", playerIds: ["daniel", "p2", "p3", "p4", "p5"], captainPlayerId: "p4" },
        { userId: "u7", playerIds: ["p1", "leo", "p3", "p4", "p5"], captainPlayerId: "leo" },
        { userId: "u8", playerIds: ["p1", "p2", "p3", "p4", "p5"], captainPlayerId: "p2" },
        { userId: "u9", playerIds: ["p1", "leo", "p3", "p4", "p5"], captainPlayerId: "leo" },
        { userId: "u10", playerIds: ["p1", "p2", "p3", "p4", "p5"], captainPlayerId: "p2" },
      ];

      const pop = calculateMarketPopularity({ currentLineups, minSample: 3 });
      const danielPop = pop.getPopularity("daniel");

      // Daniel em 6 de 10 -> 60%
      expect(danielPop.count).toBe(6);
      expect(danielPop.percent).toBe(60);

      // Daniel capitão em 3 de 10 -> 30%
      expect(danielPop.captainCount).toBe(3);
      expect(danielPop.captainPercent).toBe(30);
    });

    it("calcula delta de Mais Comprado (+4) e Mais Vendido (-5)", () => {
      const currentLineups = [
        { userId: "u1", playerIds: ["daniel", "leo"] },
        { userId: "u2", playerIds: ["daniel", "p2"] },
        { userId: "u3", playerIds: ["daniel", "p2"] },
        { userId: "u4", playerIds: ["daniel", "p2"] },
        { userId: "u5", playerIds: ["daniel", "p2"] },
        { userId: "u6", playerIds: ["daniel", "p2"] },
        { userId: "u7", playerIds: ["daniel", "p2"] }, // Daniel em 7
        { userId: "u8", playerIds: ["joao", "p2"] },
        { userId: "u9", playerIds: ["joao", "p2"] },
        { userId: "u10", playerIds: ["joao", "p2"] }, // Joao em 3
      ];

      const previousLineups = [
        { userId: "u1", playerIds: ["daniel", "joao"] },
        { userId: "u2", playerIds: ["daniel", "joao"] },
        { userId: "u3", playerIds: ["daniel", "joao"] }, // Daniel em 3
        { userId: "u4", playerIds: ["joao"] },
        { userId: "u5", playerIds: ["joao"] },
        { userId: "u6", playerIds: ["joao"] },
        { userId: "u7", playerIds: ["joao"] },
        { userId: "u8", playerIds: ["joao"] }, // Joao em 8
      ];

      const pop = calculateMarketPopularity({ currentLineups, previousLineups });
      const daniel = pop.getPopularity("daniel");
      const joao = pop.getPopularity("joao");

      // Daniel: 7 - 3 = +4
      expect(daniel.buyersDelta).toBe(4);
      // João: 3 - 8 = -5
      expect(joao.buyersDelta).toBe(-5);
    });

    it("primeira rodada sem histórico não quebra e indica ausência de histórico anterior", () => {
      const currentLineups = [{ userId: "u1", playerIds: ["daniel"] }, { userId: "u2", playerIds: ["daniel"] }];
      const pop = calculateMarketPopularity({ currentLineups, previousLineups: [] });
      const daniel = pop.getPopularity("daniel");

      expect(daniel.hasHistory).toBe(false);
      expect(daniel.buyersDelta).toBe(0);
    });
  });

  describe("Jogador Convidado e Novo sem Histórico", () => {
    it("jogador estreante não gera divisão por zero nem score absurdo", () => {
      const results = calculateFantasyPrices([
        { playerId: "newbie", games: 0, wins: 0, draws: 0, goals: 0, assists: 0, recentPoints: [], seasonPoints: [], currentPrice: 10.0 },
      ], DEFAULT_FANTASY_SETTINGS);

      const newbie = results[0];
      expect(newbie.nextPrice).toBe(10.0);
      expect(newbie.variationRate).toBe(0);
      expect(Number.isFinite(newbie.score)).toBe(true);
    });
  });

  describe("Balanceamento V2 — distribuição 30/30/40", () => {
    const marketWith = (count: number) => Array.from({ length: count }, (_, index) => ({
      playerId: `p-${index}`,
      games: 1,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      assists: count - index,
      recentPoints: [999 - index],
      seasonPoints: [999 - index],
      currentPrice: 10,
    }));

    it.each([
      [10, 3, 3, 4],
      [15, 5, 4, 6],
      [18, 6, 5, 7],
    ])("divide %i participantes em %i altas, %i estáveis e %i baixas", (count, up, stable, down) => {
      const result = calculateFantasyPrices(marketWith(count), DEFAULT_FANTASY_SETTINGS);
      expect(result.filter((item) => item.marketBand === "UP")).toHaveLength(up);
      expect(result.filter((item) => item.marketBand === "STABLE")).toHaveLength(stable);
      expect(result.filter((item) => item.marketBand === "DOWN")).toHaveLength(down);
    });

    it("aplica +12% ao melhor, -10% ao pior e ignora o histórico", () => {
      const input = marketWith(15);
      input[0].recentPoints = [-500];
      input[0].seasonPoints = [-500];
      input[14].recentPoints = [500];
      input[14].seasonPoints = [500];
      const result = calculateFantasyPrices(input, DEFAULT_FANTASY_SETTINGS);
      expect(result.find((item) => item.playerId === "p-0")?.variationRate).toBeCloseTo(0.12, 6);
      expect(result.find((item) => item.playerId === "p-14")?.variationRate).toBeCloseTo(-0.10, 6);
    });

    it("aplica exatamente +3% no fim da alta e -2% no início da baixa", () => {
      const result = calculateFantasyPrices(marketWith(15), DEFAULT_FANTASY_SETTINGS);
      expect(result.find((item) => item.playerId === "p-4")?.variationRate).toBeCloseTo(0.03, 6);
      expect(result.find((item) => item.playerId === "p-9")?.variationRate).toBeCloseTo(-0.02, 6);
    });

    it("faz jogador positivo desvalorizar se ele estiver nos últimos 40%", () => {
      const result = calculateFantasyPrices(marketWith(10), DEFAULT_FANTASY_SETTINGS);
      const bottom = result.find((item) => item.playerId === "p-9")!;
      expect(bottom.roundPoints).toBeGreaterThan(0);
      expect(bottom.marketBand).toBe("DOWN");
      expect(bottom.variationRate).toBeLessThan(0);
    });

    it("mantém todos estáveis quando todos empatam", () => {
      const tied = marketWith(15).map((player) => ({ ...player, assists: 1 }));
      const result = calculateFantasyPrices(tied, DEFAULT_FANTASY_SETTINGS);
      expect(result.every((item) => item.marketBand === "STABLE" && item.variationRate === 0)).toBe(true);
    });

    it("dá a mesma faixa, posição e variação aos empatados no corte", () => {
      const tied = marketWith(15);
      tied[4].assists = 10;
      tied[5].assists = 10;
      tied[6].assists = 10;
      const result = calculateFantasyPrices(tied, DEFAULT_FANTASY_SETTINGS);
      const group = ["p-4", "p-5", "p-6"].map((id) => result.find((item) => item.playerId === id)!);
      expect(new Set(group.map((item) => item.marketBand)).size).toBe(1);
      expect(new Set(group.map((item) => item.roundRank)).size).toBe(1);
      expect(new Set(group.map((item) => item.variationRate)).size).toBe(1);
    });

    it("exclui ausentes da divisão e respeita piso e teto", () => {
      const input = marketWith(10);
      input[0].currentPrice = 24.9;
      input[9].currentPrice = 5.1;
      input.push({ ...input[0], playerId: "absent", games: 0, currentPrice: 13.75 });
      const result = calculateFantasyPrices(input, DEFAULT_FANTASY_SETTINGS);
      expect(result.find((item) => item.playerId === "p-0")?.nextPrice).toBe(25);
      expect(result.find((item) => item.playerId === "p-9")?.nextPrice).toBe(5);
      expect(result.find((item) => item.playerId === "absent")).toMatchObject({
        nextPrice: 13.75,
        variationRate: 0,
        marketBand: "STABLE",
        roundRank: null,
      });
    });
  });
});
