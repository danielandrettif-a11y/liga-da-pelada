import type { FantasySlotRole } from "./lineup-positions";

export type FantasyReserveRole = Extract<FantasySlotRole, "ATA" | "DEF">;

export type FantasyReserveStarterScore = {
  playerId: string;
  slotRole: FantasySlotRole;
  basePoints: number;
  totalPoints: number;
  captainBonus?: number;
  isCaptain?: boolean;
  slotIndex: number;
};

export type FantasyReserveResolution = {
  applied: boolean;
  replacedPlayerId: string | null;
  replacedPlayerPoints: number;
  reservePoints: number;
  reserveTotalPoints: number;
  pointsGain: number;
  playerPointsGain: number;
  captainBonusGain: number;
  captainInherited: boolean;
};

export const FANTASY_RESERVE_PRICE_GAP = 0.1;

export type FantasyReserveStarterPrice = {
  slotRole: FantasySlotRole;
  price: number;
};

/**
 * O preço cheio do reserva precisa ficar abaixo de todos os titulares da
 * mesma posição. O desconto de 50% só é aplicado depois dessa validação.
 */
export function getFantasyReservePriceLimit(
  reserveRole: FantasyReserveRole,
  starters: FantasyReserveStarterPrice[],
): number | null {
  const matchingPrices = starters
    .filter((starter) => starter.slotRole === reserveRole && Number.isFinite(starter.price))
    .map((starter) => starter.price);

  if (matchingPrices.length === 0) return null;
  const cheapestStarter = Math.min(...matchingPrices);
  return Math.max(0, Math.round((cheapestStarter - FANTASY_RESERVE_PRICE_GAP + Number.EPSILON) * 100) / 100);
}

/** Resolve a troca automática sem alterar os scouts dos titulares. */
export function resolveFantasyReserveSubstitution(input: {
  reserveRole: FantasyReserveRole;
  reservePoints: number;
  starters: FantasyReserveStarterScore[];
  captainMultiplier?: number;
}): FantasyReserveResolution {
  const candidate = input.starters
    .filter((starter) => starter.slotRole === input.reserveRole && starter.basePoints <= 0)
    .sort((a, b) => a.basePoints - b.basePoints || a.slotIndex - b.slotIndex)[0];

  if (!candidate || input.reservePoints <= candidate.basePoints) {
    return {
      applied: false,
      replacedPlayerId: null,
      replacedPlayerPoints: 0,
      reservePoints: input.reservePoints,
      reserveTotalPoints: input.reservePoints,
      pointsGain: 0,
      playerPointsGain: 0,
      captainBonusGain: 0,
      captainInherited: false,
    };
  }

  const captainMultiplier = Number(input.captainMultiplier || 1);
  const previousCaptainBonus = Number(candidate.captainBonus || 0);
  const captainInherited = Boolean(candidate.isCaptain);
  const reserveCaptainBonus = captainInherited
    ? input.reservePoints * (captainMultiplier - 1)
    : 0;
  const playerPointsGain = input.reservePoints - candidate.basePoints;
  const captainBonusGain = reserveCaptainBonus - previousCaptainBonus;
  const reserveTotalPoints = input.reservePoints + reserveCaptainBonus;

  return {
    applied: true,
    replacedPlayerId: candidate.playerId,
    replacedPlayerPoints: candidate.totalPoints,
    reservePoints: input.reservePoints,
    reserveTotalPoints,
    pointsGain: playerPointsGain + captainBonusGain,
    playerPointsGain,
    captainBonusGain,
    captainInherited,
  };
}
