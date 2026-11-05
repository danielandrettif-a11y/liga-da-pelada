import { getFantasySlotRoles, type FantasyFormation } from "./lineup-positions";

export type AffordableMarketPlayer = {
  id: string;
  price: number;
  profile: string | null | undefined;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function formationCost(
  players: AffordableMarketPlayer[],
  playersPerTeam: number,
  formation: FantasyFormation,
) {
  const roles = getFantasySlotRoles(playersPerTeam, formation);
  const defendersNeeded = roles.filter((role) => role === "DEF").length;
  const attackersNeeded = roles.filter((role) => role === "ATA").length;
  let cheapest = Number.POSITIVE_INFINITY;

  for (const goalkeeper of players) {
    const remaining = players.filter((player) => player.id !== goalkeeper.id);
    const defenders = remaining
      .filter((player) => player.profile === "defensive")
      .sort((a, b) => a.price - b.price)
      .slice(0, defendersNeeded);
    const attackers = remaining
      .filter((player) => player.profile === "offensive" || player.profile === "midfield")
      .sort((a, b) => a.price - b.price)
      .slice(0, attackersNeeded);
    if (defenders.length !== defendersNeeded || attackers.length !== attackersNeeded) continue;
    cheapest = Math.min(
      cheapest,
      goalkeeper.price
        + defenders.reduce((total, player) => total + player.price, 0)
        + attackers.reduce((total, player) => total + player.price, 0),
    );
  }

  return Number.isFinite(cheapest) ? money(cheapest) : null;
}

/** Piso necessário para existir ao menos uma escalação completa e válida. */
export function getCheapestValidFantasyLineupCost(
  players: AffordableMarketPlayer[],
  playersPerTeam: number,
) {
  const formations: FantasyFormation[] = playersPerTeam === 6 ? ["2-3", "3-2"] : ["2-3"];
  const costs = formations
    .map((formation) => formationCost(players, playersPerTeam, formation))
    .filter((cost): cost is number => cost !== null);
  return costs.length ? Math.min(...costs) : null;
}
