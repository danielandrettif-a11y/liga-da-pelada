import type { SupabaseClient } from "@supabase/supabase-js";
import type { FantasyActiveCardDTO, FantasyPackDTO, FantasyUserCardDTO } from "@/lib/fantasy/cards/dtos";
import {
  cardDefinitionFromRow,
  groupInventoryCards,
  mapInventoryCard,
  packLeagueId,
  relationOne,
} from "../domain/card-inventory";

const PACK_SCOPE_SELECT = "round_scope:round_id(number,league_id), pass_reward:fantasy_season_pass_reward_id(fantasy_season_id, season:fantasy_seasons!fantasy_season_pass_rewards_fantasy_season_id_fkey(league_id))";

export async function readMyFantasyPacks(client: SupabaseClient, userId: string, leagueId: string) {
  const { data: packs, error } = await client.from("fantasy_round_packs")
    .select(`id, round_id, fantasy_season_pass_reward_id, status, opened_at, chosen_card_id, created_at, source, card_tier, ${PACK_SCOPE_SELECT}, offers:fantasy_pack_offers(slot, card:fantasy_cards(*))`)
    .eq("user_id", userId).order("created_at", { ascending: false });
  if (error || !packs) {
    console.error("Erro ao carregar pacotes do Cartola:", error?.message);
    return { availablePacks: [] as FantasyPackDTO[], claimedCount: 0, totalPacks: 0 };
  }
  const formatted: FantasyPackDTO[] = packs.filter((pack: any) => packLeagueId(pack) === leagueId).map((pack: any) => ({
    id: pack.id,
    roundId: pack.round_id,
    roundNumber: relationOne<any>(pack.round_scope)?.number,
    source: pack.source,
    cardTier: pack.card_tier,
    status: pack.status,
    openedAt: pack.opened_at,
    chosenCardId: pack.chosen_card_id,
    createdAt: pack.created_at,
    offers: (pack.offers || []).flatMap((offer: any) => {
      const card = cardDefinitionFromRow(offer.card);
      return card ? [{ slot: offer.slot, card }] : [];
    }),
  }));
  return {
    availablePacks: formatted.filter((pack) => pack.status === "available" || pack.status === "opened"),
    claimedCount: formatted.filter((pack) => pack.status === "claimed").length,
    totalPacks: formatted.filter((pack) => pack.status !== "dismissed").length,
  };
}

export async function readMyFantasyInventory(client: SupabaseClient, userId: string, leagueId: string): Promise<{
  cards: FantasyUserCardDTO[];
  groupedBySlug: ReturnType<typeof groupInventoryCards>;
  availableCount: number;
}> {
  const { data } = await client.from("fantasy_user_cards")
    .select("id, card_id, status, acquired_at, consumed_at, card:fantasy_cards(*)")
    .eq("user_id", userId).eq("league_id", leagueId).order("acquired_at", { ascending: false });
  if (!data) return { cards: [], groupedBySlug: {}, availableCount: 0 };
  const cards = data.map(mapInventoryCard);
  return {
    cards,
    groupedBySlug: groupInventoryCards(cards),
    availableCount: cards.filter((card) => card.status === "OWNED").length,
  };
}

export async function readMyFantasyInventoryCount(client: SupabaseClient, userId: string, leagueId: string) {
  const { count } = await client.from("fantasy_user_cards").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("league_id", leagueId).eq("status", "OWNED");
  return count || 0;
}

export async function readActiveFantasyCard(
  client: SupabaseClient,
  input: { userId: string; leagueId: string; roundId: string },
): Promise<FantasyActiveCardDTO | null> {
  const { data: round } = await client.from("rounds").select("id")
    .eq("id", input.roundId).eq("league_id", input.leagueId).maybeSingle();
  if (!round) return null;
  const { data: activation } = await client.from("fantasy_card_activations")
    .select("id, round_id, user_card_id, status, target_snapshot, result_bonus, result_details, card:fantasy_cards(*)")
    .eq("round_id", input.roundId).eq("user_id", input.userId).maybeSingle();
  if (!activation?.card) return null;
  const card = cardDefinitionFromRow(activation.card);
  if (!card) return null;
  const target = (activation.target_snapshot || {}) as any;
  let targetPlayerName = target.targetPlayerName || null;
  let targetPlayer2Name = target.targetPlayer2Name || null;
  const missingIds = [
    target.targetPlayerId && !targetPlayerName ? target.targetPlayerId : null,
    target.targetPlayer2Id && !targetPlayer2Name ? target.targetPlayer2Id : null,
  ].filter(Boolean) as string[];
  if (missingIds.length) {
    const { data: players } = await client.from("players").select("id, name").in("id", missingIds);
    const names = new Map((players || []).map((player) => [player.id, player.name]));
    if (target.targetPlayerId && !targetPlayerName) targetPlayerName = names.get(target.targetPlayerId) || null;
    if (target.targetPlayer2Id && !targetPlayer2Name) targetPlayer2Name = names.get(target.targetPlayer2Id) || null;
  }
  return {
    id: activation.id,
    roundId: activation.round_id,
    userCardId: activation.user_card_id,
    card,
    status: activation.status,
    targetPlayerId: target.targetPlayerId || null,
    targetPlayerName,
    targetPlayer2Id: target.targetPlayer2Id || null,
    targetPlayer2Name,
    targetPrediction: target.targetPrediction || null,
    resultBonus: Number(activation.result_bonus || 0),
    resultDetails: activation.result_details,
  };
}
