import { describe, expect, it } from "vitest";
import { DEFAULT_FANTASY_SETTINGS } from "./config";
import { calculateFantasyPrices, roundMoney, validateFantasyDraft } from "./engine";

type SimulatedPlayer = {
  id: string;
  name: string;
  tier: "star" | "regular" | "budget" | "volatile";
  price: number;
  seasonPoints: number[];
  recentPoints: number[];
  recentVariations: number[];
  totalWins: number;
  totalGames: number;
};

type SimulatedUser = {
  id: string;
  budget: number;
  currentLineup: string[];
  captainId: string | null;
  scoreHistory: number[];
};

describe("Cartola V2 — Simulação Econômica de Longo Prazo (15 Rodadas)", () => {
  it("executa 15 rodadas completas, garantindo estabilidade monetária, sem inflação/deflação descontrolada", () => {
    // 1. Inicializar 25 jogadores
    const players: SimulatedPlayer[] = [];
    for (let i = 1; i <= 25; i++) {
      let tier: SimulatedPlayer["tier"] = "regular";
      if (i <= 5) tier = "star";
      else if (i <= 18) tier = "regular";
      else if (i <= 22) tier = "budget";
      else tier = "volatile";

      players.push({
        id: `p_${i}`,
        name: `Jogador ${i} (${tier})`,
        tier,
        price: DEFAULT_FANTASY_SETTINGS.initialPlayerPrice, // C$ 10.00
        seasonPoints: [],
        recentPoints: [],
        recentVariations: [],
        totalWins: 0,
        totalGames: 0,
      });
    }

    // 2. Inicializar 15 usuários
    const users: SimulatedUser[] = [];
    for (let u = 1; u <= 15; u++) {
      users.push({
        id: `u_${u}`,
        budget: DEFAULT_FANTASY_SETTINGS.initialBudget, // C$ 55.00
        currentLineup: [],
        captainId: null,
        scoreHistory: [],
      });
    }

    const initialAveragePrice = players.reduce((sum, p) => sum + p.price, 0) / players.length;
    const initialAverageBudget = users.reduce((sum, u) => sum + u.budget, 0) / users.length;

    const roundCount = 15;
    const roundLog: Array<{
      round: number;
      avgPrice: number;
      minPrice: number;
      maxPrice: number;
      gainedCount: number;
      droppedCount: number;
      stableCount: number;
      avgBudget: number;
    }> = [];

    // Execução rodada a rodada
    for (let round = 1; round <= roundCount; round++) {
      const priceMap = new Map(players.map((p) => [p.id, p.price]));

      // A) Usuários escalam os melhores que o patrimônio permite
      for (const user of users) {
        // Ordena jogadores por média ou preço
        const sortedByPreference = [...players].sort((a, b) => {
          const avgA = a.seasonPoints.length ? a.seasonPoints.reduce((x, y) => x + y, 0) / a.seasonPoints.length : 10;
          const avgB = b.seasonPoints.length ? b.seasonPoints.reduce((x, y) => x + y, 0) / b.seasonPoints.length : 10;
          return avgB - avgA;
        });

        const selectedIds: string[] = [];
        let availableBudget = user.budget;

        // Escolhe o melhor atleta possível sem consumir o dinheiro necessário
        // para completar as vagas restantes. Essa reserva reproduz a decisão
        // que o mercado V6 passou a exigir do usuário.
        while (selectedIds.length < 5) {
          const remainingSlotsAfterPick = 4 - selectedIds.length;
          const candidate = sortedByPreference.find((option) => {
            if (selectedIds.includes(option.id) || option.price > availableBudget) return false;
            const cheapestRemainder = players
              .filter((player) => player.id !== option.id && !selectedIds.includes(player.id))
              .sort((a, b) => a.price - b.price)
              .slice(0, remainingSlotsAfterPick)
              .reduce((sum, player) => sum + player.price, 0);
            return option.price + cheapestRemainder <= availableBudget + 0.0001;
          });
          if (!candidate) break;
          selectedIds.push(candidate.id);
          availableBudget -= candidate.price;
        }

        user.currentLineup = selectedIds;
        user.captainId = selectedIds[0] || null;

        // Validar que a escalação respeita orçamento ou rascunho
        const validation = validateFantasyDraft({
          playerIds: user.currentLineup,
          captainPlayerId: user.captainId,
          prices: priceMap,
          budget: user.budget,
        });
        expect(validation.valid).toBe(true);
      }

      // B) Partidas acontecem (Simular performance determinística baseada no tier)
      const performances = players.map((player) => {
        // 80% de chance de jogar na rodada
        const isPresent = (round + player.id.charCodeAt(2)) % 6 !== 0;
        if (!isPresent) {
          return {
            playerId: player.id,
            games: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goals: 0,
            assists: 0,
            recentPoints: player.recentPoints,
            seasonPoints: player.seasonPoints,
            currentPrice: player.price,
          };
        }

        let goals = 0;
        let assists = 0;
        let wins = 0;
        let losses = 0;

        if (player.tier === "star") {
          goals = (round + player.name.length) % 3;
          assists = (round + 1) % 2;
          wins = 2;
          losses = 1;
        } else if (player.tier === "regular") {
          goals = (round + player.name.length) % 4 === 0 ? 1 : 0;
          assists = (round + 2) % 3 === 0 ? 1 : 0;
          wins = (round + player.id.charCodeAt(2)) % 2 === 0 ? 2 : 1;
          losses = 1;
        } else if (player.tier === "budget") {
          goals = round % 5 === 0 ? 1 : 0;
          assists = 0;
          wins = round % 3 === 0 ? 2 : 0;
          losses = 2;
        } else {
          // Volatile: ou vai muito bem ou muito mal
          goals = round % 2 === 0 ? 3 : 0;
          assists = round % 2 === 0 ? 2 : 0;
          wins = round % 2 === 0 ? 3 : 0;
          losses = round % 2 === 0 ? 0 : 3;
        }

        return {
          playerId: player.id,
          games: 3,
          wins,
          draws: 0,
          losses,
          goals,
          assists,
          recentPoints: player.recentPoints,
          seasonPoints: player.seasonPoints,
          currentPrice: player.price,
        };
      });

      // C) Calcular novos preços via motor V2
      const priceResults = calculateFantasyPrices(performances, DEFAULT_FANTASY_SETTINGS);

      let gained = 0;
      let dropped = 0;
      let stable = 0;

      for (const res of priceResults) {
        const player = players.find((p) => p.id === res.playerId)!;
        if (res.games > 0) {
          player.seasonPoints.push(res.roundPoints);
          player.recentPoints.push(res.roundPoints);
          player.recentVariations.push(res.variationRate);
          player.totalWins += res.wins;
          player.totalGames += res.games;
          if (res.variationRate > 0.005) gained++;
          else if (res.variationRate < -0.005) dropped++;
          else stable++;
        } else {
          stable++;
        }
        player.price = res.nextPrice;
      }

      // D) Atualizar patrimônio dos usuários
      for (const user of users) {
        const spent = user.currentLineup.reduce((sum, pid) => sum + (priceMap.get(pid) || 0), 0);
        const cashRemaining = user.budget - spent;
        const newTeamValue = user.currentLineup.reduce(
          (sum, pid) => sum + (priceResults.find((r) => r.playerId === pid)?.nextPrice || 0),
          0
        );
        // O V10 deixa cada decisão aparecer integralmente no patrimônio:
        // caixa restante + valor de venda do time, sem compressão artificial.
        user.budget = roundMoney(cashRemaining + newTeamValue);
      }

      const avgP = players.reduce((sum, p) => sum + p.price, 0) / players.length;
      const minP = Math.min(...players.map((p) => p.price));
      const maxP = Math.max(...players.map((p) => p.price));
      const avgB = users.reduce((sum, u) => sum + u.budget, 0) / users.length;

      roundLog.push({
        round,
        avgPrice: roundMoney(avgP),
        minPrice: minP,
        maxPrice: maxP,
        gainedCount: gained,
        droppedCount: dropped,
        stableCount: stable,
        avgBudget: roundMoney(avgB),
      });
    }

    const finalAveragePrice = players.reduce((sum, p) => sum + p.price, 0) / players.length;
    const finalAverageBudget = users.reduce((sum, u) => sum + u.budget, 0) / users.length;
    const minFinalPrice = Math.min(...players.map((p) => p.price));
    const maxFinalPrice = Math.max(...players.map((p) => p.price));

    // Validações de Equilíbrio e Anti-Inflação/Deflação:
    // 1. O preço médio sobe o suficiente para exigir escolhas, sem inflação
    // descontrolada (teto médio de C$ 13,50 após 15 rodadas).
    expect(finalAveragePrice).toBeGreaterThanOrEqual(8.0);
    expect(finalAveragePrice).toBeLessThanOrEqual(13.5);
    expect(Number.isFinite(finalAverageBudget)).toBe(true);
    expect(finalAverageBudget).toBeGreaterThan(0);

    // 2. Os limites min/max foram rigorosamente respeitados
    expect(minFinalPrice).toBeGreaterThanOrEqual(DEFAULT_FANTASY_SETTINGS.minPlayerPrice);
    expect(maxFinalPrice).toBeLessThanOrEqual(DEFAULT_FANTASY_SETTINGS.maxPlayerPrice);

    // 3. Craques valorizaram mais que a média
    const starAvgPrice =
      players.filter((p) => p.tier === "star").reduce((sum, p) => sum + p.price, 0) /
      players.filter((p) => p.tier === "star").length;
    const budgetAvgPrice =
      players.filter((p) => p.tier === "budget").reduce((sum, p) => sum + p.price, 0) /
      players.filter((p) => p.tier === "budget").length;

    expect(starAvgPrice).toBeGreaterThan(budgetAvgPrice);

    // 4. Exibir relatório da simulação
    console.log("=== RELATÓRIO DA SIMULAÇÃO ECONÔMICA (15 RODADAS) ===");
    console.log(`Preço Médio Inicial: C$ ${initialAveragePrice.toFixed(2)} -> Final: C$ ${finalAveragePrice.toFixed(2)}`);
    console.log(`Patrimônio Médio Inicial: C$ ${initialAverageBudget.toFixed(2)} -> Final: C$ ${finalAverageBudget.toFixed(2)}`);
    console.log(`Preço Mínimo: C$ ${minFinalPrice.toFixed(2)} | Preço Máximo: C$ ${maxFinalPrice.toFixed(2)}`);
    console.log(`Média Craques (Stars): C$ ${starAvgPrice.toFixed(2)} | Média Baratos (Budget): C$ ${budgetAvgPrice.toFixed(2)}`);
  });
});
