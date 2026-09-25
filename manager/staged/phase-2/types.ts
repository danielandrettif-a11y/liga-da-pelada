/** DRAFT ONLY: not imported by any app route, action or database migration. */
import type { ManagerState, Position, Ratings } from "@/lib/bq-manager/types";

export type GenericPlayer = {
  id: string;
  name: string;
  positions: Ratings;
  training: Ratings;
};
export type Lineup = { starters: { id: string; position: Position }[]; bench: string[] };
export type PlayerRecord = { games: number; goals: number; assists: number; ratingTotal: number };
export type Preparation = {
  round: number;
  collective: Position | "recovery" | null;
  individuals: { id: string; focus: Position | "recovery" }[];
};
export type MatchTicket = { id: string; round: number; lineup: Lineup; preparation: Preparation };
export type MatchReport = {
  ticketId: string;
  goalsFor: number;
  goalsAgainst: number;
  players: { id: string; minutes: number; position: Position; goals: number; assists: number; rating: number }[];
};
export type CareerDraft = {
  draftVersion: 1;
  collection: ManagerState;
  generics: GenericPlayer[];
  coins: number;
  round: number;
  stage: "varzea" | "ready-for-serie-d";
  lineup: Lineup;
  preparation: Preparation;
  condition: Record<string, number>;
  records: Record<string, PlayerRecord>;
  matches: (MatchReport & { round: number })[];
  ledger: { id: string; amount: number; reason: string }[];
  tutorialPackIds: string[];
  pendingMatch: MatchTicket | null;
};
export type DraftBalance = {
  initialCoins: number;
  matchIncome: number;
  winBonus: number;
  drawBonus: number;
  collectiveCost: number;
  individualCost: number;
  standardPackCost: number;
  genericSaleValue: number;
  trainingGain: number;
  matchGain: number;
  preparationBonus: number;
  matchFatigue: number;
  roundRecovery: number;
  focusRecovery: number;
};
