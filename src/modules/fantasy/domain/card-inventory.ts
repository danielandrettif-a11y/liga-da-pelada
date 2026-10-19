import { getCardBySlug, type FantasyCardDefinition } from "@/lib/fantasy/cards/catalog";
import type { FantasyUserCardDTO } from "@/lib/fantasy/cards/dtos";

export function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export function cardDefinitionFromRow(row: unknown): FantasyCardDefinition | null {
  const card = relationOne<any>(row as any);
  if (!card) return null;
  return getCardBySlug(card.slug) || {
    slug: card.slug || "unknown",
    name: card.name || "Carta",
    description: card.description || "",
    rarity: card.rarity || "COMMON",
    effectType: card.effect_type || "NONE",
    effectConfig: card.effect_config || {},
    enabled: card.enabled !== false,
    icon: "🃏",
    requiresTarget: "NONE",
  };
}

export function packLeagueId(pack: any): string | null {
  const round = relationOne<any>(pack.round_scope);
  if (round?.league_id) return round.league_id;
  const reward = relationOne<any>(pack.pass_reward);
  const season = relationOne<any>(reward?.season);
  return season?.league_id || null;
}

export function mapInventoryCard(item: any): FantasyUserCardDTO {
  const cardObj = relationOne<any>(item.card);
  const cardDef = getCardBySlug(cardObj?.slug);
  return {
    id: item.id,
    cardId: item.card_id,
    slug: cardObj?.slug || "unknown",
    name: cardObj?.name || "Carta",
    description: cardObj?.description || "",
    rarity: cardObj?.rarity || "COMMON",
    effectType: cardObj?.effect_type || "NONE",
    effectConfig: cardObj?.effect_config || {},
    status: item.status,
    acquiredAt: item.acquired_at,
    consumedAt: item.consumed_at,
    icon: cardDef?.icon || "🃏",
  };
}

export function groupInventoryCards(cards: FantasyUserCardDTO[]) {
  const groupedBySlug: Record<string, { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }> = {};
  for (const card of cards) {
    if (!groupedBySlug[card.slug]) {
      groupedBySlug[card.slug] = {
        count: 0,
        card: getCardBySlug(card.slug) || {
          slug: card.slug,
          name: card.name,
          description: card.description,
          rarity: card.rarity,
          effectType: card.effectType as FantasyCardDefinition["effectType"],
          effectConfig: card.effectConfig,
          enabled: true,
          icon: card.icon,
          requiresTarget: "NONE",
        },
        instances: [],
      };
    }
    if (card.status === "OWNED") groupedBySlug[card.slug].count += 1;
    groupedBySlug[card.slug].instances.push(card);
  }
  return groupedBySlug;
}
