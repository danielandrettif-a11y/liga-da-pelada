import type { SupabaseClient } from "@supabase/supabase-js";
import type { SeasonPassMutationGateway } from "../application/mutate-season-pass";

export function supabaseSeasonPassMutationGateway(client: SupabaseClient): SeasonPassMutationGateway {
  return {
    async rewardBelongsToSeason(rewardId, fantasySeasonId) {
      const { data } = await client.from("fantasy_season_pass_rewards").select("id")
        .eq("id", rewardId).eq("fantasy_season_id", fantasySeasonId).maybeSingle();
      return Boolean(data);
    },
    async shopItemBelongsToUserAndSeason(shopItemId, fantasySeasonId, userId) {
      const { data } = await client.from("fantasy_season_pass_shop_items").select("id")
        .eq("id", shopItemId).eq("fantasy_season_id", fantasySeasonId)
        .eq("user_id", userId).maybeSingle();
      return Boolean(data);
    },
    async claim(rewardId, cosmeticId) {
      const { error } = await client.rpc("claim_fantasy_pass_cosmetic", {
        p_reward_id: rewardId, p_cosmetic_id: cosmeticId,
      });
      return error?.message ?? null;
    },
    async purchase(shopItemId) {
      const { error } = await client.rpc("purchase_fantasy_pass_shop_item", {
        p_shop_item_id: shopItemId,
      });
      return error?.message ?? null;
    },
  };
}
