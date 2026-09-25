import type { DraftBalance } from "./types";

/** Experimental tuning values, NOT approved economy rules. */
export const DRAFT_BALANCE: Readonly<DraftBalance> = Object.freeze({
  initialCoins: 200,
  matchIncome: 100,
  winBonus: 40,
  drawBonus: 15,
  collectiveCost: 30,
  individualCost: 15,
  standardPackCost: 250,
  genericSaleValue: 40,
  trainingGain: 0.1,
  matchGain: 0.1,
  preparationBonus: 1,
  matchFatigue: 20,
  roundRecovery: 15,
  focusRecovery: 15,
});

export const VARZEA_ROUNDS = 8;
export const REWARD_ROUNDS = [1, 2, 3, 4, 6, 8] as const;
export const FORMATION = ["GOL", "DEF", "DEF", "ALA_MEI", "ALA_MEI", "ATA"] as const;

export const CHAPTERS = [
  "Primeiro apito", "O bairro conhece o time", "Defendendo nossas cores", "Jogo de conjunto",
  "Virando rotina", "Uma nova força", "A última preparação", "A porta da Série D",
] as const;
