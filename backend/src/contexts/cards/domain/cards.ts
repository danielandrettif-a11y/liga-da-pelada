export type FantasyCardRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
export type FantasyCardTarget = "NONE" | "SINGLE_PLAYER" | "DUO_PLAYERS" | "PREDICTION_TYPE";

export type FantasyCardDefinition = {
  id?: string; slug: string; name: string; description: string; rarity: FantasyCardRarity;
  effectType: string; effectConfig: Record<string, unknown>; enabled: boolean; icon: string;
  requiresTarget: FantasyCardTarget;
};

export type FantasyPackDTO = {
  id: string; roundId: string | null; roundNumber?: number; source?: string;
  cardTier?: "bronze" | "gold" | null; status: "available" | "opened" | "claimed" | "dismissed";
  openedAt: string | null; chosenCardId: string | null; createdAt: string;
  offers: Array<{ slot: number; card: FantasyCardDefinition }>;
};

export type FantasyUserCardDTO = {
  id: string; cardId: string; slug: string; name: string; description: string;
  rarity: FantasyCardRarity; effectType: string; effectConfig: Record<string, unknown>;
  status: "OWNED" | "RESERVED" | "LOCKED" | "CONSUMED"; acquiredAt: string;
  consumedAt: string | null; icon: string;
};

export type FantasyActiveCardDTO = {
  id: string; roundId: string; userCardId: string; card: FantasyCardDefinition;
  status: "RESERVED" | "LOCKED" | "RESOLVED"; targetPlayerId?: string | null;
  targetPlayerName?: string | null; targetPlayer2Id?: string | null; targetPlayer2Name?: string | null;
  targetPrediction?: string | null; resultBonus?: number; resultDetails?: unknown;
};

const SINGLE_TARGET = new Set([
  "vice_captain", "golden_goal", "golden_assist", "scout", "all_in", "so_vim_pela_resenha",
  "samu_do_cartola", "tava_em_campo", "my_mvp", "head_to_head", "bagre_insurance",
  "bagre_value_shield", "triple_crown", "bagre_or_craque", "emergency_sub",
]);
const DUO_TARGET = new Set(["double_prediction", "duo"]);

export function cardTargetRequirement(slug: string): FantasyCardTarget {
  if (DUO_TARGET.has(slug)) return "DUO_PLAYERS";
  if (SINGLE_TARGET.has(slug)) return "SINGLE_PLAYER";
  return "NONE";
}

export function validateCardActivation(params: {
  cardDefinition: FantasyCardDefinition; targetPlayerId?: string | null;
  targetPlayer2Id?: string | null; targetPrediction?: string | null; isRoundOpen: boolean;
}): { valid: boolean; error?: string } {
  if (!params.isRoundOpen) return { valid: false, error: "O mercado já está fechado para esta rodada." };
  if (params.cardDefinition.requiresTarget === "SINGLE_PLAYER" && !params.targetPlayerId) {
    return { valid: false, error: `A carta "${params.cardDefinition.name}" exige a escolha de um atleta-alvo.` };
  }
  if (params.cardDefinition.requiresTarget === "DUO_PLAYERS"
    && (!params.targetPlayerId || !params.targetPlayer2Id || params.targetPlayerId === params.targetPlayer2Id)) {
    return { valid: false, error: "Escolha dois atletas diferentes para esta carta." };
  }
  if (params.cardDefinition.requiresTarget === "PREDICTION_TYPE" && !params.targetPrediction) {
    return { valid: false, error: "Escolha o tipo de palpite desta carta." };
  }
  return { valid: true };
}

export function validatePackClaim(params: { pack: FantasyPackDTO; chosenSlug: string }) {
  if (params.pack.status === "claimed") return { valid: false, error: "Este pacote já foi resgatado." };
  if (params.pack.status !== "opened") return { valid: false, error: "O pacote precisa ser aberto antes de escolher a carta." };
  if (!params.pack.offers.some((offer) => offer.card.slug === params.chosenSlug)) {
    return { valid: false, error: "A carta escolhida não pertence às ofertas deste pacote." };
  }
  return { valid: true };
}
