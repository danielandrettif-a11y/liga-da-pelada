import type { FantasyCardEffectType, FantasyCardRarity } from "./config";

export type FantasyCardDefinition = {
  id?: string;
  slug: string;
  name: string;
  icon: string;
  description: string;
  rarity: FantasyCardRarity;
  effectType: FantasyCardEffectType;
  effectConfig: Record<string, any>;
  enabled: boolean;
  requiresTarget: "NONE" | "SINGLE_PLAYER" | "DUO_PLAYERS" | "PREDICTION_TYPE";
  targetFilter?: "ANY_IN_LINEUP" | "BELOW_MEDIAN_PRICE" | "CHEAPEST_50_PERCENT";
};

export const FANTASY_CARDS_CATALOG: FantasyCardDefinition[] = [
  {
    slug: "super_captain",
    name: "Super Capitão",
    icon: "👑",
    description: "Seu capitão pontua 3x total na rodada em vez de 2x.",
    rarity: "LEGENDARY",
    effectType: "CAPTAIN_MULTIPLIER",
    effectConfig: { multiplier: 3 },
    enabled: true,
    requiresTarget: "NONE",
  },
  {
    slug: "extra_credit",
    name: "Crédito Extra",
    icon: "💰",
    description: "+C$5,00 temporários para montar seu elenco nesta rodada sem alterar o patrimônio.",
    rarity: "COMMON",
    effectType: "BUDGET_BONUS",
    effectConfig: { bonus: 5 },
    enabled: true,
    requiresTarget: "NONE",
  },
  {
    slug: "double_prediction",
    name: "Palpite Duplo",
    icon: "🎯",
    description: "Dobra a recompensa do palpite selecionado (Artilheiro, Garçom ou Desafio).",
    rarity: "RARE",
    effectType: "PREDICTION_MULTIPLIER",
    effectConfig: { multiplier: 2 },
    enabled: true,
    requiresTarget: "PREDICTION_TYPE",
  },
  {
    slug: "bargain",
    name: "Barganha",
    icon: "🤑",
    description: "20% de desconto no preço de 1 jogador escalado para fins de orçamento.",
    rarity: "COMMON",
    effectType: "PLAYER_DISCOUNT",
    effectConfig: { discountPercent: 20 },
    enabled: true,
    requiresTarget: "SINGLE_PLAYER",
    targetFilter: "ANY_IN_LINEUP",
  },
  {
    slug: "vice_captain",
    name: "Vice-Capitão",
    icon: "🛡️",
    description: "Se o seu Capitão oficial pontuar negativo na rodada, o jogador escolhido como Vice-Capitão assume o multiplicador 2x.",
    rarity: "RARE",
    effectType: "VICE_CAPTAIN",
    effectConfig: {},
    enabled: true,
    requiresTarget: "SINGLE_PLAYER",
    targetFilter: "ANY_IN_LINEUP",
  },
  {
    slug: "golden_goal",
    name: "Gol de Ouro",
    icon: "⚽",
    description: "Se o jogador selecionado marcar 1 ou mais gols, ganhe +3 pontos extras.",
    rarity: "COMMON",
    effectType: "CONDITIONAL_PLAYER_BONUS",
    effectConfig: { metric: "goals", threshold: 1, bonus: 3 },
    enabled: true,
    requiresTarget: "SINGLE_PLAYER",
    targetFilter: "ANY_IN_LINEUP",
  },
  {
    slug: "golden_assist",
    name: "Passe de Ouro",
    icon: "🍽️",
    description: "Se o jogador selecionado der 1 ou mais assistências, ganhe +3 pontos extras.",
    rarity: "COMMON",
    effectType: "CONDITIONAL_PLAYER_BONUS",
    effectConfig: { metric: "assists", threshold: 1, bonus: 3 },
    enabled: true,
    requiresTarget: "SINGLE_PLAYER",
    targetFilter: "ANY_IN_LINEUP",
  },
  {
    slug: "scout",
    name: "Caça-Talentos",
    icon: "💎",
    description: "Ganhe 50% dos pontos base (máx +6 pts) de um atleta escalado abaixo da mediana de preço.",
    rarity: "EPIC",
    effectType: "CONDITIONAL_PLAYER_BONUS",
    effectConfig: { percentage: 0.5, maxBonus: 6, belowMedianPrice: true },
    enabled: true,
    requiresTarget: "SINGLE_PLAYER",
    targetFilter: "BELOW_MEDIAN_PRICE",
  },
  {
    slug: "duo",
    name: "Dobradinha",
    icon: "⚡",
    description: "Escolha 2 jogadores da sua escalação. Se ambos ficarem acima da média da rodada, ganhe +5 pontos.",
    rarity: "RARE",
    effectType: "CONDITIONAL_DUO_BONUS",
    effectConfig: { bonus: 5, aboveRoundAverage: true },
    enabled: true,
    requiresTarget: "DUO_PLAYERS",
    targetFilter: "ANY_IN_LINEUP",
  },
  {
    slug: "all_in",
    name: "All-In",
    icon: "🎰",
    description: "Escolha um atleta dos 50% mais baratos da rodada. Se ele terminar no TOP 5 da rodada, ganhe +6 pontos.",
    rarity: "EPIC",
    effectType: "CONDITIONAL_PLAYER_BONUS",
    effectConfig: { bonus: 6, cheapestPercentile: 0.5, topRank: 5 },
    enabled: true,
    requiresTarget: "SINGLE_PLAYER",
    targetFilter: "CHEAPEST_50_PERCENT",
  },
  {
    slug: "safe_prediction",
    name: "Palpite Seguro",
    icon: "🔮",
    description: "Escolha 2 jogadores no Desafio da Rodada. Se qualquer um cumprir, ganhe 60% da recompensa.",
    rarity: "RARE",
    effectType: "SAFE_PREDICTION",
    effectConfig: { rewardMultiplier: 0.6 },
    enabled: true,
    requiresTarget: "NONE",
  },
  {
    slug: "emergency_sub",
    name: "Reserva de Emergência",
    icon: "🔄",
    description: "Um 6º jogador entra no lugar de um titular do seu time que pontuou negativo na rodada.",
    rarity: "EPIC",
    effectType: "EMERGENCY_SUB",
    effectConfig: {},
    enabled: true,
    requiresTarget: "SINGLE_PLAYER",
  },
];

export function getCardBySlug(slug: string): FantasyCardDefinition | undefined {
  return FANTASY_CARDS_CATALOG.find((card) => card.slug === slug);
}
