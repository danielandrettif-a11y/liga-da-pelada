import type { FantasyCardDefinition } from "./catalog";
import type { FantasyCardRarity } from "./config";

export type FantasyPackDTO = {
  id: string;
  roundId: string | null;
  roundNumber?: number;
  source?: string;
  cardTier?: "bronze" | "gold" | null;
  status: "available" | "opened" | "claimed" | "dismissed";
  openedAt: string | null;
  chosenCardId: string | null;
  createdAt: string;
  offers: Array<{ slot: number; card: FantasyCardDefinition }>;
};

export type FantasyUserCardDTO = {
  id: string;
  cardId: string;
  slug: string;
  name: string;
  description: string;
  rarity: FantasyCardRarity;
  effectType: string;
  effectConfig: Record<string, any>;
  status: "OWNED" | "RESERVED" | "LOCKED" | "CONSUMED";
  acquiredAt: string;
  consumedAt: string | null;
  icon: string;
};

export type FantasyActiveCardDTO = {
  id: string;
  roundId: string;
  userCardId: string;
  card: FantasyCardDefinition;
  status: "RESERVED" | "LOCKED" | "RESOLVED";
  targetPlayerId?: string | null;
  targetPlayerName?: string | null;
  targetPlayer2Id?: string | null;
  targetPlayer2Name?: string | null;
  targetPrediction?: "TOP_SCORER" | "TOP_ASSIST" | "CHALLENGE" | null;
  resultBonus?: number;
  resultDetails?: any;
};
