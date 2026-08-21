import type { FantasyCardDefinition } from "./catalog";
import type { FantasyCardEffectType } from "./config";
import { isFantasyPriceEligible } from "./eligibility";

export type CardResolverPlayer = {
  playerId: string;
  name?: string;
  price: number;
  priceAfter?: number;
  basePoints: number;
  goals: number;
  assists: number;
  wins: number;
  losses: number;
  games: number;
  isCaptain?: boolean;
};

export type CardResolverContext = {
  roundAverageBasePoints: number;
  allRoundPlayers: Array<{
    playerId: string;
    price: number;
    basePoints: number;
    rank?: number;
    goals?: number;
    assists?: number;
    games?: number;
    name?: string;
  }>;
  predictionsResults?: {
    topScorerHit?: boolean;
    topAssistHit?: boolean;
    challengeHit?: boolean;
    topScorerReward?: number;
    topAssistReward?: number;
    challengeReward?: number;
  };
};

export type CardResolverTarget = {
  targetPlayerId?: string | null;
  targetPlayer2Id?: string | null;
  targetPrediction?: "TOP_SCORER" | "TOP_ASSIST" | "CHALLENGE" | null;
};

export type CardResolutionResult = {
  applied: boolean;
  bonusPoints: number;
  captainMultiplierOverride?: number;
  viceCaptainActivated?: boolean;
  description: string;
  budgetBonus?: number;
  playerDiscountPercent?: number;
  discountedPlayerId?: string;
  budgetRecovery?: number;
};

export class CardEffectResolver {
  /**
   * Resolve o efeito de uma carta de pontuação de forma pura e determinística.
   */
  static resolveScoreEffect(
    card: FantasyCardDefinition | { slug: string; effectType: FantasyCardEffectType; effectConfig: Record<string, any> },
    target: CardResolverTarget,
    lineupPlayers: CardResolverPlayer[],
    captainPlayerId: string | null,
    context: CardResolverContext
  ): CardResolutionResult {
    const effectType = card.effectType;
    const config = card.effectConfig || {};

    const captain = lineupPlayers.find((p) => p.playerId === captainPlayerId);

    switch (effectType) {
      // 1. 👑 SUPER CAPITÃO (3x total no capitão)
      case "CAPTAIN_MULTIPLIER": {
        if (!captain) {
          return {
            applied: false,
            bonusPoints: 0,
            description: "Capitão não encontrado na escalação.",
          };
        }
        const multiplier = config.multiplier || 3;
        // O capitão normal já recebe (basePoints * 2). O Super Capitão faz ser (basePoints * 3),
        // ou seja, o bônus adicional gerado pela carta é (basePoints * 1) = basePoints * (multiplier - 2).
        const maxBonus = Number(config.maxBonus ?? Number.POSITIVE_INFINITY);
        const extraPoints = Math.min(maxBonus, captain.basePoints * (multiplier - 2));
        return {
          applied: true,
          bonusPoints: extraPoints,
          captainMultiplierOverride: multiplier,
          description: `Super Capitão ativado (${multiplier}x total): +${extraPoints.toFixed(1)} pts extras no capitão ${captain.name || ""}`.trim(),
        };
      }

      // 2. 💰 CRÉDITO EXTRA (Econômica - não afeta pontuação na resolução)
      case "BUDGET_BONUS": {
        const bonus = config.bonus || 5;
        return {
          applied: true,
          bonusPoints: 0,
          budgetBonus: bonus,
          description: `Crédito Extra de +C$ ${bonus.toFixed(2)} aplicado no orçamento da rodada.`,
        };
      }

      // 3. 🎯 PALPITE DUPLO (2 gols de um atleta + 2 assistências de outro)
      case "PREDICTION_MULTIPLIER": {
        if (card.slug === "double_prediction") {
          const goalsPlayer = context.allRoundPlayers.find((player) => player.playerId === target.targetPlayerId);
          const assistsPlayer = context.allRoundPlayers.find((player) => player.playerId === target.targetPlayer2Id);
          const hit = Boolean(
            goalsPlayer && assistsPlayer && goalsPlayer.playerId !== assistsPlayer.playerId
            && (goalsPlayer.goals || 0) >= 2 && (assistsPlayer.assists || 0) >= 2,
          );
          const bonus = Number(config.bonus || 6);
          return {
            applied: hit,
            bonusPoints: hit ? bonus : 0,
            description: hit
              ? `Palpite Duplo completo: ${goalsPlayer?.name || "o primeiro atleta"} fez 2 gols e ${assistsPlayer?.name || "o segundo atleta"} deu 2 assistências (+${bonus.toFixed(1)} pts).`
              : "Palpite Duplo não completado: eram necessários 2 gols do primeiro atleta e 2 assistências do segundo.",
          };
        }
        const mult = config.multiplier || 2;
        const predType = target.targetPrediction || "TOP_SCORER";
        const preds = context.predictionsResults || {};

        let hit = false;
        let originalReward = 0;
        let predName = "Artilheiro";

        if (predType === "TOP_SCORER") {
          hit = Boolean(preds.topScorerHit);
          originalReward = preds.topScorerReward || 8;
          predName = "Artilheiro";
        } else if (predType === "TOP_ASSIST") {
          hit = Boolean(preds.topAssistHit);
          originalReward = preds.topAssistReward || 8;
          predName = "Garçom";
        } else if (predType === "CHALLENGE") {
          hit = Boolean(preds.challengeHit);
          originalReward = preds.challengeReward || 6;
          predName = "Desafio da Rodada";
        }

        if (hit) {
          const bonus = originalReward * (mult - 1);
          return {
            applied: true,
            bonusPoints: bonus,
            description: `Palpite Duplo em ${predName} acertou! +${bonus.toFixed(1)} pts de bônus dobrado.`,
          };
        }

        return {
          applied: false,
          bonusPoints: 0,
          description: `Palpite Duplo em ${predName} não pontuou (palpite incorreto).`,
        };
      }

      // 4. 🤑 BARGANHA (Econômica - 20% de desconto para montagem)
      case "PLAYER_DISCOUNT": {
        const discountPercent = config.discountPercent || 20;
        const targetPlayer = lineupPlayers.find((p) => p.playerId === target.targetPlayerId);
        return {
          applied: true,
          bonusPoints: 0,
          playerDiscountPercent: discountPercent,
          discountedPlayerId: target.targetPlayerId || undefined,
          description: targetPlayer
            ? `Barganha: ${discountPercent}% de desconto no preço de ${targetPlayer.name || "jogador"}.`
            : `Barganha: ${discountPercent}% de desconto aplicado.`,
        };
      }

      // 5. 🛡️ VICE-CAPITÃO (Se capitão oficial não jogou, vice assume 2x)
      case "VICE_CAPTAIN": {
        const vice = lineupPlayers.find((p) => p.playerId === target.targetPlayerId);
        if (!vice) {
          return {
            applied: false,
            bonusPoints: 0,
            description: "Vice-Capitão não selecionado.",
          };
        }

        const viceOutscoredCaptain = !captain || vice.basePoints > captain.basePoints;

        if (viceOutscoredCaptain) {
          // A escalação normal já contém o bônus 2x do capitão. Para trocar a
          // braçadeira sem contar os dois multiplicadores, entra apenas a diferença.
          const swappedBonus = vice.basePoints - (captain?.basePoints || 0);
          const bonus = Math.min(Number(config.maxBonus ?? 8), Math.max(0, swappedBonus));
          return {
            applied: true,
            bonusPoints: bonus,
            viceCaptainActivated: true,
            description: `Vice-Capitão ${vice.name || ""} superou o Capitão e assumiu a braçadeira: +${bonus.toFixed(1)} pts.`,
          };
        }

        return {
          applied: false,
          bonusPoints: 0,
          viceCaptainActivated: false,
          description: `Vice-Capitão não ativado: sua pontuação-base não superou a do Capitão.`,
        };
      }

      // 6. ⚽ GOL DE OURO / 🍽️ PASSE DE OURO / 💎 CAÇA-TALENTOS / 🎰 ALL-IN
      case "CONDITIONAL_PLAYER_BONUS": {
        // All-In não exige que o atleta esteja na própria escalação.
        if (card.slug === "all_in" && config.topRank) {
          const targetPlayer = context.allRoundPlayers.find((player) => player.playerId === target.targetPlayerId);
          if (!targetPlayer) {
            return { applied: false, bonusPoints: 0, description: "Jogador alvo não encontrado no mercado." };
          }
          const bonus = config.bonus || 6;
          const maxRank = config.topRank || 5;
          const playerRank = 1 + context.allRoundPlayers.filter(
            (player) => player.basePoints > targetPlayer.basePoints,
          ).length;
          const applied = playerRank <= maxRank && (targetPlayer.games || 0) > 0;
          return {
            applied,
            bonusPoints: applied ? bonus : 0,
            description: applied
              ? `All-In acertou! ${targetPlayer.name || "Jogador"} terminou em ${playerRank}º lugar (+${bonus.toFixed(1)} pts).`
              : `All-In não atingiu TOP ${maxRank}: ${targetPlayer.name || "Jogador"} ficou em ${playerRank}º lugar (0 pts).`,
          };
        }

        const targetPlayer = lineupPlayers.find((p) => p.playerId === target.targetPlayerId);
        if (!targetPlayer) {
          return {
            applied: false,
            bonusPoints: 0,
            description: "Jogador alvo não encontrado na escalação.",
          };
        }

        // Gol de Ouro (metric = goals, threshold = 1, bonus = 3)
        if (config.metric === "goals") {
          const threshold = config.threshold || 1;
          const bonus = config.bonus || 3;
          if (targetPlayer.goals >= threshold) {
            return {
              applied: true,
              bonusPoints: bonus,
              description: `Gol de Ouro: ${targetPlayer.name || "Jogador"} marcou ${targetPlayer.goals} gol(s) (+${bonus.toFixed(1)} pts).`,
            };
          }
          return {
            applied: false,
            bonusPoints: 0,
            description: `Gol de Ouro: ${targetPlayer.name || "Jogador"} não marcou gols (0 pts).`,
          };
        }

        // Passe de Ouro (metric = assists, threshold = 1, bonus = 3)
        if (config.metric === "assists") {
          const threshold = config.threshold || 1;
          const bonus = config.bonus || 3;
          if (targetPlayer.assists >= threshold) {
            return {
              applied: true,
              bonusPoints: bonus,
              description: `Passe de Ouro: ${targetPlayer.name || "Jogador"} deu ${targetPlayer.assists} assistência(s) (+${bonus.toFixed(1)} pts).`,
            };
          }
          return {
            applied: false,
            bonusPoints: 0,
            description: `Passe de Ouro: ${targetPlayer.name || "Jogador"} não deu assistências (0 pts).`,
          };
        }

        if (config.maxGoals === 0 && config.maxAssists === 0 && config.minWins) {
          const applied = targetPlayer.goals === 0
            && targetPlayer.assists === 0
            && targetPlayer.wins >= Number(config.minWins);
          const bonus = applied ? Number(config.bonus || 3) : 0;
          return {
            applied,
            bonusPoints: bonus,
            description: applied
              ? `Só Vim Pela Resenha concluída por ${targetPlayer.name || "Jogador"} (+${bonus.toFixed(1)} pts).`
              : "Só Vim Pela Resenha não cumpriu 0 gols, 0 assistências e 2+ vitórias.",
          };
        }

        if (config.lineupRank === "LOWEST" || config.lineupRank === "HIGHEST") {
          const comparison = config.lineupRank === "LOWEST"
            ? Math.min(...lineupPlayers.map((player) => player.basePoints))
            : Math.max(...lineupPlayers.map((player) => player.basePoints));
          const applied = lineupPlayers.length > 0 && targetPlayer.basePoints === comparison;
          const bonus = applied ? Number(config.bonus || 0) : 0;
          return {
            applied,
            bonusPoints: bonus,
            description: applied
              ? `${card.slug === "my_mvp" ? "Craque do Meu Time" : "Tava em Campo?"} concluída (+${bonus.toFixed(1)} pts).`
              : "O jogador escolhido não terminou na posição exigida dentro da escalação.",
          };
        }

        if (config.minGoals && config.minAssists && config.minWins) {
          const applied = targetPlayer.goals >= Number(config.minGoals)
            && targetPlayer.assists >= Number(config.minAssists)
            && targetPlayer.wins >= Number(config.minWins);
          const bonus = applied ? Number(config.bonus || 6) : 0;
          return {
            applied,
            bonusPoints: bonus,
            description: applied
              ? `Tríplice Coroa concluída por ${targetPlayer.name || "Jogador"} (+${bonus.toFixed(1)} pts).`
              : "Tríplice Coroa não completada: era necessário gol, assistência e vitória.",
          };
        }

        // Caça-Talentos (percentage = 0.5, maxBonus = 6, belowMedianPrice = true)
        if (config.belowMedianPrice) {
          const eligible = isFantasyPriceEligible(
            { targetFilter: "BELOW_MEDIAN_PRICE" },
            { id: targetPlayer.playerId, price: targetPlayer.price },
            context.allRoundPlayers.map((player) => ({ id: player.playerId, price: player.price })),
          );
          if (!eligible) {
            return { applied: false, bonusPoints: 0, description: "Caça-Talentos inválido: atleta fora da faixa de preço elegível." };
          }
          const percentage = config.percentage || 0.5;
          const maxBonus = config.maxBonus || 6;
          const rawBonus = Math.max(0, targetPlayer.basePoints * percentage);
          const finalBonus = Math.min(maxBonus, rawBonus);

          return {
            applied: true,
            bonusPoints: finalBonus,
            description: `Caça-Talentos: ${targetPlayer.name || "Jogador"} fez ${targetPlayer.basePoints.toFixed(1)} pts (+${finalBonus.toFixed(1)} pts bônus).`,
          };
        }

        return {
          applied: false,
          bonusPoints: 0,
          description: "Efeito condicional de jogador não reconhecido.",
        };
      }

      // 9. ⚡ DOBRADINHA (2 jogadores terminam acima da média da rodada -> +5 pts)
      case "CONDITIONAL_DUO_BONUS": {
        const p1 = lineupPlayers.find((p) => p.playerId === target.targetPlayerId);
        const p2 = lineupPlayers.find((p) => p.playerId === target.targetPlayer2Id);

        if (!p1 || !p2 || p1.playerId === p2.playerId) {
          return {
            applied: false,
            bonusPoints: 0,
            description: "Dupla de jogadores inválida para a Dobradinha.",
          };
        }

        const bonus = config.bonus || 5;
        const avg = context.roundAverageBasePoints;
        const p1Ok = p1.games > 0 && p1.basePoints > avg;
        const p2Ok = p2.games > 0 && p2.basePoints > avg;

        if (p1Ok && p2Ok) {
          return {
            applied: true,
            bonusPoints: bonus,
            description: `Dobradinha concluída! ${p1.name || "P1"} (${p1.basePoints.toFixed(1)}) e ${p2.name || "P2"} (${p2.basePoints.toFixed(1)}) acima da média ${avg.toFixed(1)} (+${bonus.toFixed(1)} pts).`,
          };
        }

        const failedNames = [
          !p1Ok ? `${p1.name || "P1"} (${p1.basePoints.toFixed(1)})` : null,
          !p2Ok ? `${p2.name || "P2"} (${p2.basePoints.toFixed(1)})` : null,
        ]
          .filter(Boolean)
          .join(" e ");

        return {
          applied: false,
          bonusPoints: 0,
          description: `Dobradinha falhou: ${failedNames} abaixo da média da rodada (${avg.toFixed(1)} pts).`,
        };
      }

      case "PLAYER_SCORE_PROTECTION": {
        const targetPlayer = lineupPlayers.find((player) => player.playerId === target.targetPlayerId);
        if (!targetPlayer) {
          return { applied: false, bonusPoints: 0, description: "Jogador protegido não encontrado na escalação." };
        }

        if (targetPlayer.basePoints < 0) {
          const bonus = -targetPlayer.basePoints;
          return {
            applied: true,
            bonusPoints: bonus,
            description: `${card.slug === "samu_do_cartola" ? "Samu do Cartola" : card.slug === "bagre_or_craque" ? "Bagre ou Craque?" : "Seguro contra Bagres"}: pontuação negativa ajustada para 0 (+${bonus.toFixed(1)} pts).`,
          };
        }

        if (card.slug === "bagre_insurance") {
          const bases = context.allRoundPlayers.map((player) => player.basePoints).sort((a, b) => a - b);
          const middle = Math.floor(bases.length / 2);
          const median = bases.length === 0 ? 0 : bases.length % 2
            ? bases[middle]
            : (bases[middle - 1] + bases[middle]) / 2;
          const applied = targetPlayer.basePoints > 0 && targetPlayer.basePoints < median;
          const bonus = applied ? Number(config.belowMedianBonus || 2) : 0;
          return {
            applied,
            bonusPoints: bonus,
            description: applied
              ? `Seguro contra Bagres: pontuação positiva abaixo da mediana (+${bonus.toFixed(1)} pts).`
              : "Seguro contra Bagres não foi acionado.",
          };
        }

        if (card.slug === "bagre_or_craque") {
          const rank = 1 + context.allRoundPlayers.filter((player) => player.basePoints > targetPlayer.basePoints).length;
          const applied = targetPlayer.games > 0 && rank <= Number(config.topRank || 5);
          const bonus = applied ? Number(config.topBonus || 5) : 0;
          return {
            applied,
            bonusPoints: bonus,
            description: applied
              ? `Bagre ou Craque?: jogador terminou em ${rank}º (+${bonus.toFixed(1)} pts).`
              : "Bagre ou Craque? não foi acionada.",
          };
        }

        return { applied: false, bonusPoints: 0, description: "O jogador não terminou com pontuação negativa." };
      }

      case "PLAYER_VALUE_SHIELD": {
        const targetPlayer = lineupPlayers.find((player) => player.playerId === target.targetPlayerId);
        if (!targetPlayer) {
          return { applied: false, bonusPoints: 0, budgetRecovery: 0, description: "Jogador protegido não encontrado." };
        }
        const loss = Math.max(0, targetPlayer.price - Number(targetPlayer.priceAfter ?? targetPlayer.price));
        const recovery = Math.min(Number(config.maxRecovery || 2), loss);
        return {
          applied: recovery > 0,
          bonusPoints: 0,
          budgetRecovery: recovery,
          description: recovery > 0
            ? `Fundo Garantidor recuperou C$${recovery.toFixed(2)} da desvalorização.`
            : "O jogador protegido não desvalorizou.",
        };
      }

      case "HEAD_TO_HEAD_BONUS": {
        const chosen = lineupPlayers.find((player) => player.playerId === target.targetPlayerId);
        const opponent = context.allRoundPlayers.find((player) => player.playerId === target.targetPlayer2Id);
        if (!chosen || !opponent) {
          return { applied: false, bonusPoints: 0, description: "Duelo Direto sem os dois jogadores definidos." };
        }
        const applied = chosen.basePoints > opponent.basePoints;
        const bonus = applied ? Number(config.bonus || 5) : 0;
        return {
          applied,
          bonusPoints: bonus,
          description: applied
            ? `Duelo Direto vencido: ${chosen.basePoints.toFixed(1)} x ${opponent.basePoints.toFixed(1)} (+${bonus.toFixed(1)} pts).`
            : `Duelo Direto não vencido: ${chosen.basePoints.toFixed(1)} x ${opponent.basePoints.toFixed(1)}.`,
        };
      }

      case "LINEUP_CONDITION_BONUS": {
        const maxRank = Number(config.allPlayersTopRank || 8);
        const allInside = lineupPlayers.length === 5 && lineupPlayers.every((player) => {
          const rank = 1 + context.allRoundPlayers.filter((entry) => entry.basePoints > player.basePoints).length;
          return player.games > 0 && rank <= maxRank;
        });
        const bonus = allInside ? Number(config.bonus || 8) : 0;
        return {
          applied: allInside,
          bonusPoints: bonus,
          description: allInside
            ? `Seleção dos Sonhos completa: os 5 ficaram no TOP ${maxRank} (+${bonus.toFixed(1)} pts).`
            : `Seleção dos Sonhos não completada: os 5 precisavam ficar no TOP ${maxRank}.`,
        };
      }

      default:
        return {
          applied: false,
          bonusPoints: 0,
          description: `Efeito ${effectType} não possui pontuação ativa.`,
        };
    }
  }
}
