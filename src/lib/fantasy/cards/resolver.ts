import type { FantasyCardDefinition } from "./catalog";
import type { FantasyCardEffectType } from "./config";
import { isFantasyPriceEligible } from "./eligibility";

export type CardResolverPlayer = {
  playerId: string;
  name?: string;
  price: number;
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

      // 3. 🎯 PALPITE DUPLO (Dobra recompensa do palpite selecionado)
      case "PREDICTION_MULTIPLIER": {
        if (card.slug === "double_prediction") {
          const preds = context.predictionsResults || {};
          const hit = Boolean(preds.topScorerHit) && Boolean(preds.topAssistHit);
          const bonus = Number(config.bonus || 6);
          return {
            applied: hit,
            bonusPoints: hit ? bonus : 0,
            description: hit
              ? `Palpite Duplo completo: gol e assistência confirmados (+${bonus.toFixed(1)} pts).`
              : "Palpite Duplo não completado: era necessário acertar gol e assistência.",
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

        // All-In (cheapestPercentile = 0.5, topRank = 5, bonus = 6)
        if (config.topRank) {
          const eligible = isFantasyPriceEligible(
            { targetFilter: "CHEAPEST_50_PERCENT" },
            { id: targetPlayer.playerId, price: targetPlayer.price },
            context.allRoundPlayers.map((player) => ({ id: player.playerId, price: player.price })),
          );
          if (!eligible) {
            return { applied: false, bonusPoints: 0, description: "All-In inválido: atleta fora dos 50% mais baratos." };
          }
          const bonus = config.bonus || 6;
          const maxRank = config.topRank || 5;

          // Cálculo da posição no ranking da rodada com empate justo (1 + contagem de estritamente maiores)
          const strictlyHigher = context.allRoundPlayers.filter(
            (p) => p.basePoints > targetPlayer.basePoints
          ).length;
          const playerRank = 1 + strictlyHigher;

          if (playerRank <= maxRank && targetPlayer.games > 0) {
            return {
              applied: true,
              bonusPoints: bonus,
              description: `All-In acertou! ${targetPlayer.name || "Jogador"} terminou em ${playerRank}º lugar (+${bonus.toFixed(1)} pts).`,
            };
          }

          return {
            applied: false,
            bonusPoints: 0,
            description: `All-In não atingiu TOP ${maxRank}: ${targetPlayer.name || "Jogador"} ficou em ${playerRank}º lugar (0 pts).`,
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

      default:
        return {
          applied: false,
          bonusPoints: 0,
          description: `Efeito ${effectType} não possui pontuação ativa.`,
        };
    }
  }
}
