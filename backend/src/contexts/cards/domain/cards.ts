export type FantasyCardRarity = "common" | "rare" | "epic" | "legendary";

export type FantasyCardDefinition = {
  slug: string;
  name: string;
  description: string;
  rarity: FantasyCardRarity;
  cost: number;
  requiresTargetPlayer?: boolean;
};

export type FantasyPackDTO = {
  id: string;
  userId: string;
  leagueId: string;
  status: "unopened" | "opened" | "claimed";
  cardSlugOffer1?: string | null;
  cardSlugOffer2?: string | null;
  createdAt: string;
};

export type FantasyUserCardDTO = {
  id: string;
  userId: string;
  cardSlug: string;
  status: "available" | "active" | "used";
  acquiredAt: string;
};

export type FantasyActiveCardDTO = {
  id: string;
  userId: string;
  roundId: string;
  cardSlug: string;
  targetPlayerId?: string | null;
  targetPlayer2Id?: string | null;
  targetPrediction?: string | null;
  appliedAt: string;
};

export function validateCardActivation(params: {
  cardDefinition: FantasyCardDefinition;
  targetPlayerId?: string | null;
  isRoundOpen: boolean;
}): { valid: boolean; error?: string } {
  if (!params.isRoundOpen) {
    return { valid: false, error: "A rodada já iniciou ou encerrou. Não é permitido ativar cartas." };
  }

  if (params.cardDefinition.requiresTargetPlayer && !params.targetPlayerId) {
    return { valid: false, error: `A carta "${params.cardDefinition.name}" exige a escolha de um atleta-alvo.` };
  }

  return { valid: true };
}

export function validatePackClaim(params: {
  pack: FantasyPackDTO;
  chosenSlug: string;
}): { valid: boolean; error?: string } {
  if (params.pack.status === "claimed") {
    return { valid: false, error: "Este pacote já foi resgatado." };
  }

  if (params.pack.status !== "opened") {
    return { valid: false, error: "O pacote precisa ser aberto antes de escolher a carta." };
  }

  const validSlugs = [params.pack.cardSlugOffer1, params.pack.cardSlugOffer2].filter(Boolean);
  if (!validSlugs.includes(params.chosenSlug)) {
    return { valid: false, error: "A carta escolhida não pertence às ofertas deste pacote." };
  }

  return { valid: true };
}
