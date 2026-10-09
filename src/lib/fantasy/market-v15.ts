export type MarketV15Input = {
  currentPrice: number;
  officialPoints: number;
  positionMedianPoints: number;
  roundQuality: number;
  formQuality: number;
  seasonQuality: number;
  positionPriceQuality: number;
  games: number;
  minPrice?: number;
  maxPrice?: number;
};

export type MarketV15Result = {
  expectedPoints: number;
  deliveryQuality: number;
  marketQuality: number;
  surprise: number;
  variation: number;
  priceChange: number;
  nextPrice: number;
  band: "UP" | "STABLE" | "DOWN";
  guardrail: "DID_NOT_PLAY" | "TOP_15" | "POSITIVE_ABOVE_MEDIAN" | "EXPENSIVE_OK" | "NONE";
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Espelho puro do Mercado V15 executado no PostgreSQL. */
export function calculateMarketV15Price(input: MarketV15Input): MarketV15Result {
  const minPrice = input.minPrice ?? 5;
  const maxPrice = input.maxPrice ?? 22;
  if (input.games <= 0) {
    const nextPrice = money(clamp(input.currentPrice, minPrice, maxPrice));
    return {
      expectedPoints: 0,
      deliveryQuality: 0.5,
      marketQuality: 0.5,
      surprise: 0,
      variation: 0,
      priceChange: nextPrice - input.currentPrice,
      nextPrice,
      band: "STABLE",
      guardrail: "DID_NOT_PLAY",
    };
  }

  const roundQuality = clamp(input.roundQuality, 0, 1);
  const formQuality = clamp(input.formQuality, 0, 1);
  const seasonQuality = clamp(input.seasonQuality, 0, 1);
  const positionPriceQuality = clamp(input.positionPriceQuality, 0, 1);
  const positionMedian = Math.max(0, input.positionMedianPoints);
  const expectedPoints = positionMedian * (0.70 + 0.60 * positionPriceQuality);
  const deliveryScale = 2 * Math.max(8, Math.abs(expectedPoints));
  const deliveryQuality = clamp(
    0.5 + (input.officialPoints - expectedPoints) / deliveryScale,
    0,
    1,
  );
  const marketQuality = (
    0.50 * roundQuality
    + 0.25 * deliveryQuality
    + 0.15 * formQuality
    + 0.10 * seasonQuality
  );
  const surprise = roundQuality - positionPriceQuality;
  let targetVariation = clamp(
    (marketQuality - 0.5) * 0.20 + surprise * 0.04,
    -0.10,
    0.15,
  );
  let guardrail: MarketV15Result["guardrail"] = "NONE";

  if (roundQuality >= 0.85) {
    targetVariation = Math.max(targetVariation, 0.03);
    guardrail = "TOP_15";
  } else if (input.officialPoints > 0 && roundQuality >= 0.50) {
    targetVariation = Math.max(targetVariation, 0);
    guardrail = "POSITIVE_ABOVE_MEDIAN";
  } else if (positionPriceQuality >= 0.80 && roundQuality >= 0.50) {
    targetVariation = Math.max(targetVariation, 0);
    guardrail = "EXPENSIVE_OK";
  }

  const breakout = positionPriceQuality <= 0.35 && roundQuality >= 0.85;
  targetVariation = clamp(targetVariation, -0.10, breakout ? 0.15 : 0.12);
  const targetChange = input.currentPrice * targetVariation;
  const boundedChange = clamp(targetChange, -1.20, breakout ? 1.80 : 1.50);
  const nextPrice = money(clamp(input.currentPrice + boundedChange, minPrice, maxPrice));
  const priceChange = money(nextPrice - input.currentPrice);
  const variation = input.currentPrice > 0 ? priceChange / input.currentPrice : 0;

  return {
    expectedPoints,
    deliveryQuality,
    marketQuality,
    surprise,
    variation,
    priceChange,
    nextPrice,
    band: variation > 0.015 ? "UP" : variation < -0.015 ? "DOWN" : "STABLE",
    guardrail,
  };
}
