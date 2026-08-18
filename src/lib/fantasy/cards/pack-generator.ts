import { FANTASY_CARDS_CATALOG, type FantasyCardDefinition } from "./catalog";
import { FANTASY_RARITY_PROBABILITIES, type FantasyCardRarity } from "./config";

/**
 * Sorteia uma raridade com base nas probabilidades oficiais da V3:
 * COMMON: 55%, RARE: 30%, EPIC: 12%, LEGENDARY: 3%
 */
export function rollRarity(randomFn: () => number = Math.random): FantasyCardRarity {
  const roll = randomFn();
  let cumulative = 0;

  const rarities: FantasyCardRarity[] = ["COMMON", "RARE", "EPIC", "LEGENDARY"];
  for (const rarity of rarities) {
    cumulative += FANTASY_RARITY_PROBABILITIES[rarity];
    if (roll <= cumulative) {
      return rarity;
    }
  }
  return "COMMON";
}

/**
 * Sorteia 2 opções de cartas para um pacote de recompensa.
 * Garante que Carta A != Carta B e que as probabilidades de raridade sejam respeitadas.
 */
export function generatePackOffers(
  catalog: FantasyCardDefinition[] = FANTASY_CARDS_CATALOG.filter((c) => c.enabled),
  randomFn: () => number = Math.random
): [FantasyCardDefinition, FantasyCardDefinition] {
  if (catalog.length < 2) {
    throw new Error("O catálogo deve conter pelo menos 2 cartas habilitadas para gerar um pacote.");
  }

  function pickOne(excludeSlug?: string): FantasyCardDefinition {
    const rarity = rollRarity(randomFn);
    let candidates = catalog.filter((c) => c.rarity === rarity && c.slug !== excludeSlug);

    // Fallback se não houver cartas daquela raridade com slug diferente
    if (candidates.length === 0) {
      candidates = catalog.filter((c) => c.slug !== excludeSlug);
    }
    if (candidates.length === 0) {
      candidates = catalog;
    }

    const index = Math.floor(randomFn() * candidates.length);
    return candidates[index];
  }

  const offer1 = pickOne();
  const offer2 = pickOne(offer1.slug);

  return [offer1, offer2];
}
