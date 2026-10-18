import type { SupabaseClient } from "@supabase/supabase-js";
import type { CosmeticsDashboardRows } from "../domain/dashboard-types";

type DashboardReadInput = {
  userId: string;
  leagueId: string;
  seasonId: string | null;
  isAdmin: boolean;
};

/** Lê apenas com o cliente da sessão; RLS continua protegendo as linhas. */
export async function readCosmeticsDashboardRows(
  client: SupabaseClient,
  input: DashboardReadInput,
): Promise<CosmeticsDashboardRows | null> {
  const { data: fantasySeason } = input.seasonId
    ? await client.from("fantasy_seasons").select("id")
      .eq("season_id", input.seasonId).eq("league_id", input.leagueId).maybeSingle()
    : { data: null };
  const fantasySeasonId = fantasySeason?.id || null;

  const [ownedResult, catalogResult, rewardResult, choiceResult, loadoutResult, passResult, shopResult] = await Promise.all([
    // A proveniência mantém visível a escolha de resgates feitos antes da tabela de escolhas.
    client.from("fantasy_user_cosmetics")
      .select("cosmetic_id, source_reward_id, cosmetic:fantasy_cosmetics(*)")
      .eq("user_id", input.userId),
    client.from("fantasy_cosmetics").select("*").order("created_at"),
    fantasySeasonId
      ? client.from("fantasy_season_pass_rewards")
        .select("id, house, reward_key, reward_type, card_tier, bonus:bonus_cosmetic_id(*), options:fantasy_season_pass_reward_options(cosmetic:fantasy_cosmetics(*))")
        .eq("fantasy_season_id", fantasySeasonId).order("house")
      : Promise.resolve({ data: [], error: null }),
    fantasySeasonId
      ? client.from("fantasy_user_cosmetic_reward_choices")
        .select("reward_id, cosmetic_id").eq("user_id", input.userId)
      : Promise.resolve({ data: [], error: null }),
    client.from("account_cosmetic_loadouts").select("*")
      .eq("user_id", input.userId).maybeSingle(),
    fantasySeasonId
      ? client.from("fantasy_season_passes")
        .select("progress, total_progress_points, shop_bonus_points")
        .eq("user_id", input.userId).eq("fantasy_season_id", fantasySeasonId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    fantasySeasonId
      ? client.from("fantasy_season_pass_shop_items")
        .select("id, price_points, purchased_at, source_reward_id, cosmetic:fantasy_cosmetics(*)")
        .eq("user_id", input.userId).eq("fantasy_season_id", fantasySeasonId).order("listed_at")
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Loja e saldo são complementos. Falha neles não oculta a coleção e as recompensas.
  if (ownedResult.error || rewardResult.error || catalogResult.error) return null;
  return {
    fantasySeasonId,
    isAdmin: input.isAdmin,
    // O cliente sem schema gerado infere o embed muitos-para-um como lista;
    // a FK `cosmetic` retorna um objeto singular no PostgREST.
    owned: (ownedResult.data || []) as unknown as CosmeticsDashboardRows["owned"],
    catalog: (catalogResult.data || []) as CosmeticsDashboardRows["catalog"],
    rewards: (rewardResult.data || []) as CosmeticsDashboardRows["rewards"],
    choices: (choiceResult.data || []) as CosmeticsDashboardRows["choices"],
    loadout: (loadoutResult.data || null) as CosmeticsDashboardRows["loadout"],
    pass: (passResult.error ? null : passResult.data) as CosmeticsDashboardRows["pass"],
    shop: (shopResult.error ? [] : (shopResult.data || [])) as unknown as CosmeticsDashboardRows["shop"],
  };
}
