import { DEFAULT_FANTASY_SETTINGS, type FantasySettings } from "./config";

export type FantasyMarketHealthLevel = "ACCESSIBLE" | "BALANCED" | "COMPETITIVE";

export type FantasyMarketHealth = {
  version: number;
  level: FantasyMarketHealthLevel;
  pressure: number;
  difficultyMultiplier: number;
  eliteAffordabilityRate: number | null;
  competitiveAffordabilityRate: number | null;
  economyAffordabilityRate: number | null;
  economyLineupCost: number | null;
  competitiveLineupCost: number | null;
  eliteLineupCost: number | null;
  medianEliteRatio: number | null;
};

export type MarketV11PriceInput = {
  currentPrice: number;
  marketQuality: number;
  roundMarketQuality: number;
  priceQuality: number;
  difficultyMultiplier?: number;
};

export type MarketV11PriceResult = {
  baseTarget: number;
  adaptiveTarget: number;
  recoveryBonus: number;
  expensiveRisk: number;
  finalTarget: number;
  repriceStrength: number;
  upCap: number;
  downCap: number;
  nextPrice: number;
  profile: "CHEAP_BREAKOUT" | "INTERMEDIATE" | "EXPENSIVE" | "EXPENSIVE_BAD";
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function getFantasyMarketHealthLevel(pressure: number): FantasyMarketHealthLevel {
  if (pressure <= -0.20) return "ACCESSIBLE";
  if (pressure >= 0.20) return "COMPETITIVE";
  return "BALANCED";
}

export function calculateMarketDifficulty(input: {
  eliteAffordabilityRate: number;
  medianEliteRatio: number;
  previousMultiplier?: number;
}, settings: FantasySettings = DEFAULT_FANTASY_SETTINGS) {
  const affordabilityGap = clamp(
    (input.eliteAffordabilityRate - (settings.marketTargetEliteAffordability ?? 0.20)) / 0.30,
    -1,
    1,
  );
  const medianGap = clamp(
    (input.medianEliteRatio - (settings.marketTargetMedianEliteRatio ?? 0.86)) / 0.20,
    -1,
    1,
  );
  const pressure = clamp(0.65 * affordabilityGap + 0.35 * medianGap, -1, 1);
  const step = settings.marketDifficultyStep ?? 0.03;
  const previous = input.previousMultiplier ?? settings.marketDifficultyMultiplier ?? 1;
  const multiplier = clamp(
    previous + clamp(pressure * step, -step, step),
    settings.marketDifficultyMin ?? 0.94,
    settings.marketDifficultyMax ?? 1.18,
  );
  return {
    affordabilityGap,
    medianGap,
    pressure,
    multiplier,
    level: getFantasyMarketHealthLevel(pressure),
  };
}

export function calculateMarketV11Price(
  input: MarketV11PriceInput,
  settings: FantasySettings = DEFAULT_FANTASY_SETTINGS,
): MarketV11PriceResult {
  const quality = clamp(input.marketQuality, 0, 1);
  const roundQuality = clamp(input.roundMarketQuality, 0, 1);
  const priceQuality = clamp(input.priceQuality, 0, 1);
  const difficulty = clamp(
    input.difficultyMultiplier ?? settings.marketDifficultyMultiplier ?? 1,
    settings.marketDifficultyMin ?? 0.94,
    settings.marketDifficultyMax ?? 1.18,
  );
  const baseTarget = 5.75 + 12.25 * Math.pow(quality, 1.85);
  const tierPressure = 1 + (difficulty - 1) * Math.pow(quality, 2.20);
  const adaptiveTarget = baseTarget * tierPressure;
  const surprise = roundQuality - priceQuality;
  const recoveryBonus = (settings.marketRecoveryBonusStrength ?? 2.40)
    * Math.max(0, surprise)
    * Math.pow(1 - priceQuality, 1.30);
  const expensiveRisk = (settings.marketExpensiveRiskStrength ?? 1.20)
    * Math.max(0, priceQuality - roundQuality)
    * priceQuality;
  const finalTarget = clamp(
    adaptiveTarget + recoveryBonus - expensiveRisk,
    settings.minPlayerPrice,
    settings.maxPlayerPrice,
  );

  const cheap = priceQuality <= (settings.marketCheapPercentile ?? 0.35);
  const breakout = cheap && roundQuality >= (settings.marketBreakoutRoundPercentile ?? 0.70);
  const expensive = priceQuality >= (settings.marketElitePercentile ?? 0.80);
  const expensiveBad = expensive && roundQuality <= (settings.marketBadRoundPercentile ?? 0.35);
  const profile = breakout ? "CHEAP_BREAKOUT" : expensiveBad ? "EXPENSIVE_BAD" : expensive ? "EXPENSIVE" : "INTERMEDIATE";
  const repriceStrength = breakout
    ? settings.marketBreakoutRepriceStrength ?? 0.40
    : settings.marketRepriceStrength ?? 0.30;
  const upCap = profile === "CHEAP_BREAKOUT" ? 0.18 : profile === "INTERMEDIATE" ? 0.15 : profile === "EXPENSIVE" ? 0.10 : 0.08;
  const downCap = profile === "CHEAP_BREAKOUT" ? 0.08 : profile === "INTERMEDIATE" ? 0.12 : profile === "EXPENSIVE" ? 0.12 : 0.14;
  const desired = input.currentPrice + (finalTarget - input.currentPrice) * repriceStrength;
  const nextPrice = money(clamp(
    desired,
    Math.max(settings.minPlayerPrice, input.currentPrice * (1 - downCap)),
    Math.min(settings.maxPlayerPrice, input.currentPrice * (1 + upCap)),
  ));

  return {
    baseTarget: money(baseTarget),
    adaptiveTarget: money(adaptiveTarget),
    recoveryBonus: money(recoveryBonus),
    expensiveRisk: money(expensiveRisk),
    finalTarget: money(finalTarget),
    repriceStrength,
    upCap,
    downCap,
    nextPrice,
    profile,
  };
}

export function percentileById(values: Array<{ id: string; value: number }>) {
  const sorted = [...values].sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
  const result = new Map<string, number>();
  if (sorted.length <= 1) {
    sorted.forEach((item) => result.set(item.id, 0.5));
    return result;
  }
  for (let start = 0; start < sorted.length;) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1].value === sorted[start].value) end += 1;
    const percentile = ((start + end) / 2) / (sorted.length - 1);
    for (let index = start; index <= end; index += 1) result.set(sorted[index].id, percentile);
    start = end + 1;
  }
  return result;
}
