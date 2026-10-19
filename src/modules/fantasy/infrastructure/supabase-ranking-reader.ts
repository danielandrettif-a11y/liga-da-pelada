import type { SupabaseClient } from "@supabase/supabase-js";

export async function readFantasySeasonId(client: SupabaseClient, seasonId: string) {
  return client.from("fantasy_seasons").select("id").eq("season_id", seasonId).maybeSingle();
}

export async function readFantasyRankingPeriodRows(client: SupabaseClient, fantasySeasonId: string) {
  const [accounts, rounds] = await Promise.all([
    client
      .from("fantasy_accounts")
      .select("id, user_id, total_points, current_budget, rounds_played, best_round_points")
      .eq("fantasy_season_id", fantasySeasonId),
    client
      .from("fantasy_rounds")
      .select("id, round_id, market_status, round:round_id(date, status)")
      .eq("fantasy_season_id", fantasySeasonId),
  ]);
  return { accounts, rounds };
}

export async function readScoredFantasyLineups(client: SupabaseClient, fantasyRoundIds: string[]) {
  if (!fantasyRoundIds.length) return { data: [] as any[], error: null };
  return client
    .from("fantasy_lineups")
    .select("user_id, total_points, fantasy_lineup_players(total_points, captain_bonus, slot_role, player_profile_locked)")
    .in("fantasy_round_id", fantasyRoundIds)
    .eq("status", "scored");
}

export async function readFantasyRankingIdentities(
  client: SupabaseClient,
  userIds: string[],
  roundId?: string | null,
) {
  if (!userIds.length) {
    return {
      profiles: { data: [] as any[], error: null },
      cosmetics: { data: [] as any[], error: null },
      activations: { data: [] as any[], error: null },
    };
  }
  const [profiles, cosmetics, activations] = await Promise.all([
    client
      .from("account_profiles")
      .select("user_id, players(name, avatar_url)")
      .in("user_id", userIds),
    client
      .from("account_cosmetic_loadouts")
      .select("user_id, frame:frame_cosmetic_id(asset_key), aura:aura_cosmetic_id(asset_key), nameplate:nameplate_cosmetic_id(asset_key), title:title_cosmetic_id(name), background:background_cosmetic_id(asset_key)")
      .in("user_id", userIds),
    roundId
      ? client
          .from("fantasy_card_activations")
          .select("user_id, status, result_bonus, result_details, card:fantasy_cards(slug, name, rarity)")
          .eq("round_id", roundId)
          .in("user_id", userIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  return { profiles, cosmetics, activations };
}
