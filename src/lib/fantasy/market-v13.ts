export type MarketV13Input = {
  currentPrice: number;
  roundPoints: number;
  roundQuality: number;
  formQuality: number;
  seasonQuality: number;
  priceQuality: number;
  games: number;
  minPrice?: number;
  maxPrice?: number;
};

export type MarketV13Result = {
  marketQuality: number;
  surprise: number;
  variation: number;
  nextPrice: number;
  band: "UP" | "STABLE" | "DOWN";
  guardrail: "DID_NOT_PLAY" | "TOP_15" | "GOOD_ROUND" | "EXPENSIVE_OK" | "NONE";
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Espelho puro do Mercado V13 executado no PostgreSQL. */
export function calculateMarketV13Price(input: MarketV13Input): MarketV13Result {
  const minPrice = input.minPrice ?? 5;
  const maxPrice = input.maxPrice ?? 22;
  if (input.games <= 0) {
    return {
      marketQuality: 0.5,
      surprise: 0,
      variation: 0,
      nextPrice: money(clamp(input.currentPrice, minPrice, maxPrice)),
      band: "STABLE",
      guardrail: "DID_NOT_PLAY",
    };
  }

  const roundQuality = clamp(input.roundQuality, 0, 1);
  const formQuality = clamp(input.formQuality, 0, 1);
  const seasonQuality = clamp(input.seasonQuality, 0, 1);
  const priceQuality = clamp(input.priceQuality, 0, 1);
  const marketQuality = 0.60 * roundQuality + 0.25 * formQuality + 0.15 * seasonQuality;
  const surprise = roundQuality - priceQuality;
  let variation = clamp((marketQuality - 0.5) * 0.20 + surprise * 0.06, -0.10, 0.15);
  let guardrail: MarketV13Result["guardrail"] = "NONE";

  if (roundQuality >= 0.85) {
    variation = Math.max(variation, 0.03);
    guardrail = "TOP_15";
  } else if (input.roundPoints > 0 && roundQuality >= 0.60) {
    variation = Math.max(variation, 0);
    guardrail = "GOOD_ROUND";
  } else if (priceQuality >= 0.80 && roundQuality >= 0.50) {
    variation = Math.max(variation, 0);
    guardrail = "EXPENSIVE_OK";
  }

  variation = clamp(variation, -0.10, priceQuality <= 0.35 && roundQuality >= 0.85 ? 0.15 : 0.12);
  const nextPrice = money(clamp(input.currentPrice * (1 + variation), minPrice, maxPrice));
  const realizedVariation = input.currentPrice > 0 ? (nextPrice - input.currentPrice) / input.currentPrice : 0;
  return {
    marketQuality,
    surprise,
    variation: realizedVariation,
    nextPrice,
    band: realizedVariation > 0.015 ? "UP" : realizedVariation < -0.015 ? "DOWN" : "STABLE",
    guardrail,
  };
}
