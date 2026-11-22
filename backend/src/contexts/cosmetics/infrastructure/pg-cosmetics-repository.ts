import type { Pool } from "pg";
import type { CosmeticsRepository } from "../application/manage-cosmetics.js";
import {
  type CosmeticSlot,
  type CosmeticPreviewLoadout,
  type CosmeticPreviewSummary,
  VALID_COSMETIC_SLOTS,
  type EquippedCosmeticsSummary,
  sanitizeEquippedCosmetics,
  buildEquippedSummaryFromItems,
} from "../domain/cosmetics.js";

export class PgCosmeticsRepository implements CosmeticsRepository {
  constructor(private readonly pool: Pool) {}

  private async authenticated<T>(userId: string, action: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true), set_config('request.jwt.claims',$2,true), set_config('search_path','public, auth',true)", [userId, JSON.stringify({ sub: userId, role: "authenticated" })]);
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getCosmeticsDashboard(params: { userId: string; leagueId: string; seasonId: string | null }): Promise<any> {
    const { userId, leagueId, seasonId } = params;
    if (!leagueId) return null;
    return this.authenticated(userId, async (client) => {
      const access = await client.query(`SELECT public.is_league_member($1::uuid) AS member,
        public.is_league_admin($1::uuid) AS admin`, [leagueId]);
      if (!access.rows[0]?.member) return null;
      const season = seasonId ? await client.query(`SELECT id FROM public.fantasy_seasons
        WHERE league_id=$1::uuid AND season_id=$2::uuid LIMIT 1`, [leagueId, seasonId]) : { rows: [] };
      const fantasySeasonId = season.rows[0]?.id ?? null;
      const owned = await client.query(`SELECT own.cosmetic_id, own.source_reward_id, to_jsonb(item) AS cosmetic
        FROM public.fantasy_user_cosmetics own LEFT JOIN public.fantasy_cosmetics item ON item.id=own.cosmetic_id
        WHERE own.user_id=$1::uuid`, [userId]);
      const catalog = await client.query('SELECT * FROM public.fantasy_cosmetics ORDER BY created_at');
      const loadout = await client.query('SELECT * FROM public.account_cosmetic_loadouts WHERE user_id=$1::uuid', [userId]);
      const rewards = fantasySeasonId ? await client.query(`SELECT reward.id,reward.house,reward.reward_key,reward.reward_type,reward.card_tier,
        to_jsonb(bonus) AS bonus, COALESCE((SELECT jsonb_agg(jsonb_build_object('cosmetic',to_jsonb(cosmetic)))
          FROM public.fantasy_season_pass_reward_options option_item LEFT JOIN public.fantasy_cosmetics cosmetic ON cosmetic.id=option_item.cosmetic_id
          WHERE option_item.reward_id=reward.id),'[]'::jsonb) AS options
        FROM public.fantasy_season_pass_rewards reward LEFT JOIN public.fantasy_cosmetics bonus ON bonus.id=reward.bonus_cosmetic_id
        WHERE reward.fantasy_season_id=$1::uuid ORDER BY reward.house`, [fantasySeasonId]) : { rows: [] };
      const choices = fantasySeasonId ? await client.query('SELECT reward_id,cosmetic_id FROM public.fantasy_user_cosmetic_reward_choices WHERE user_id=$1::uuid', [userId]) : { rows: [] };
      const pass = fantasySeasonId ? await client.query(`SELECT progress,total_progress_points,shop_bonus_points FROM public.fantasy_season_passes
        WHERE user_id=$1::uuid AND fantasy_season_id=$2::uuid`, [userId, fantasySeasonId]) : { rows: [] };
      const shop = fantasySeasonId ? await client.query(`SELECT item.id,item.price_points,item.purchased_at,item.source_reward_id,to_jsonb(cosmetic) AS cosmetic
        FROM public.fantasy_season_pass_shop_items item LEFT JOIN public.fantasy_cosmetics cosmetic ON cosmetic.id=item.cosmetic_id
        WHERE item.user_id=$1::uuid AND item.fantasy_season_id=$2::uuid ORDER BY item.listed_at`, [userId, fantasySeasonId]) : { rows: [] };
      return { fantasySeasonId, isAdmin: Boolean(access.rows[0].admin), owned: owned.rows, catalog: catalog.rows,
        rewards: rewards.rows, choices: choices.rows, loadout: loadout.rows[0] ?? null, pass: pass.rows[0] ?? null, shop: shop.rows };
    });
  }

  async equipCosmetic(params: {
    userId: string;
    slot: CosmeticSlot;
    cosmeticId: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      await this.authenticated(params.userId, async (client) => {
        const result = await client.query<{ applied: boolean }>("SELECT public.equip_account_cosmetic($1::text, $2::uuid) AS applied", [params.slot, params.cosmeticId]);
        if (result.rows[0]?.applied !== true) throw new Error("Não foi possível equipar o cosmético.");
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async claimPassCosmetic(params: {
    userId: string;
    rewardId: string;
    cosmeticId: string;
    fantasySeasonId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      return await this.authenticated(params.userId, async (client) => {
        const reward = await client.query("SELECT 1 FROM public.fantasy_season_pass_rewards reward JOIN public.fantasy_seasons season ON season.id=reward.fantasy_season_id WHERE reward.id=$1::uuid AND season.id=$2::uuid AND public.is_league_member(season.league_id)", [params.rewardId, params.fantasySeasonId]);
        if (!reward.rowCount) return { success: false, error: "Recompensa não pertence à pelada selecionada." };
        const result = await client.query<{ applied: boolean }>("SELECT public.claim_fantasy_pass_cosmetic($1::uuid,$2::uuid) AS applied", [params.rewardId, params.cosmeticId]);
        if (result.rows[0]?.applied !== true) throw new Error("Não foi possível resgatar a recompensa.");
        return { success: true };
      });
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async purchaseSeasonPassShopItem(params: {
    userId: string;
    shopItemId: string;
    fantasySeasonId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      return await this.authenticated(params.userId, async (client) => {
        const item = await client.query("SELECT 1 FROM public.fantasy_season_pass_shop_items item JOIN public.fantasy_seasons season ON season.id=item.fantasy_season_id WHERE item.id=$1::uuid AND item.fantasy_season_id=$2::uuid AND item.user_id=$3::uuid AND public.is_league_member(season.league_id)", [params.shopItemId, params.fantasySeasonId, params.userId]);
        if (!item.rowCount) return { success: false, error: "Item não pertence à pelada selecionada." };
        const result = await client.query<{ applied: boolean }>("SELECT public.purchase_fantasy_pass_shop_item($1::uuid) AS applied", [params.shopItemId]);
        if (result.rows[0]?.applied !== true) throw new Error("Não foi possível concluir a compra.");
        return { success: true };
      });
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private async readLoadouts(userId: string, playerIds?: string[], own = false): Promise<Array<{ player_id: string | null; summary: CosmeticPreviewSummary }>> {
    if (playerIds?.length === 0) return [];
    return this.authenticated(userId, async (client) => {
      const rows = await client.query(`SELECT profile.player_id,
        jsonb_build_object('frameKey', frame.asset_key, 'auraKey', aura.asset_key, 'titleName', title.name,
          'bannerAssetKey', banner.asset_key, 'nameplateKey', nameplate.asset_key,
          'backgroundAssetKey', background.asset_key, 'showcaseAssetKey', showcase.asset_key,
          'pitchAssetKey', pitch.asset_key) AS summary
        FROM public.account_cosmetic_loadouts loadout
        LEFT JOIN public.account_profiles profile ON profile.user_id=loadout.user_id
        LEFT JOIN public.fantasy_cosmetics frame ON frame.id=loadout.frame_cosmetic_id
        LEFT JOIN public.fantasy_cosmetics aura ON aura.id=loadout.aura_cosmetic_id
        LEFT JOIN public.fantasy_cosmetics title ON title.id=loadout.title_cosmetic_id
        LEFT JOIN public.fantasy_cosmetics banner ON banner.id=loadout.banner_cosmetic_id
        LEFT JOIN public.fantasy_cosmetics nameplate ON nameplate.id=loadout.nameplate_cosmetic_id
        LEFT JOIN public.fantasy_cosmetics background ON background.id=loadout.background_cosmetic_id
        LEFT JOIN public.fantasy_cosmetics showcase ON showcase.id=loadout.showcase_cosmetic_id
        LEFT JOIN public.fantasy_cosmetics pitch ON pitch.id=loadout.pitch_cosmetic_id
        WHERE ($1::boolean = false OR loadout.user_id=$2::uuid)
          AND ($3::text[] IS NULL OR profile.player_id::text=ANY($3::text[]))`, [own, userId, playerIds ?? null]);
      return rows.rows;
    });
  }

  async getMyEquippedCosmetics(userId: string): Promise<CosmeticPreviewSummary | null> {
    const rows = await this.readLoadouts(userId, undefined, true);
    return rows[0]?.summary ?? null;
  }

  async getPlayerEquippedCosmetics(userId: string, playerId: string): Promise<CosmeticPreviewSummary | null> {
    const rows = await this.readLoadouts(userId, [playerId]);
    return rows[0]?.summary ?? null;
  }

  async getAllPlayersEquippedCosmeticsMap(userId: string, playerIds?: string[]): Promise<Record<string, CosmeticPreviewSummary>> {
    const rows = await this.readLoadouts(userId, playerIds);
    return Object.fromEntries(rows.filter((row) => row.player_id).map((row) => [row.player_id!, row.summary]));
  }

  async resolveAdminCosmeticsPreview(params: {
    userId: string;
    leagueId: string;
    playerId: string;
    requested: CosmeticPreviewLoadout;
  }): Promise<CosmeticPreviewSummary | null> {
    if (!params.leagueId || !params.playerId || !params.requested || typeof params.requested !== "object" || Array.isArray(params.requested)) return null;
    const selections = Object.entries(params.requested).filter(([slot, id]) => VALID_COSMETIC_SLOTS.includes(slot as CosmeticSlot) && typeof id === "string" && id.length > 0) as Array<[CosmeticSlot, string]>;
    if (!selections.length) return null;
    return this.authenticated(params.userId, async (client) => {
      const allowed = await client.query(`SELECT 1 FROM public.account_profiles p WHERE p.user_id=$1::uuid
        AND p.player_id=$2::uuid AND public.is_league_admin($3::uuid)`, [params.userId, params.playerId, params.leagueId]);
      if (!allowed.rowCount) return null;
      const items = await client.query<{ id: string; slot: string; asset_key: string | null; name: string | null }>(
        "SELECT id,slot,asset_key,name FROM public.fantasy_cosmetics WHERE id::text=ANY($1::text[])", [[...new Set(selections.map(([, id]) => id))]]);
      const byId = new Map(items.rows.map((item) => [item.id, item]));
      const preview: CosmeticPreviewSummary = { frameKey: null, auraKey: null, titleName: null, bannerAssetKey: null, nameplateKey: null, backgroundAssetKey: null, showcaseAssetKey: null, pitchAssetKey: null };
      const fields: Record<string, keyof CosmeticPreviewSummary> = { frame: "frameKey", aura: "auraKey", title: "titleName", banner: "bannerAssetKey", nameplate: "nameplateKey", background: "backgroundAssetKey", showcase: "showcaseAssetKey", pitch: "pitchAssetKey" };
      for (const [slot, id] of selections) {
        const item = byId.get(id);
        const field = fields[slot];
        if (item && item.slot === slot && field) preview[field] = slot === "title" ? item.name : item.asset_key;
      }
      return preview;
    });
  }

  private async runOwnCleanup(userId: string, fantasySeasonId: string | null, operation: "cleanup_my_cosmetics_preview" | "dismiss_my_unopened_bronze_pass_pack" | "reset_my_test_pass_cosmetic_claims"): Promise<{ success: boolean; count?: number; error?: string }> {
    if (!fantasySeasonId) return { success: false, error: "Passe da pelada selecionada não encontrado." };
    try {
      const count = await this.authenticated(userId, async (client) => {
        const result = await client.query<{ count: number }>(`SELECT public.${operation}($1::uuid) AS count`, [fantasySeasonId]);
        if (!result.rows[0] || result.rows[0].count == null) throw new Error("A limpeza não retornou um resultado válido.");
        return Number(result.rows[0].count);
      });
      return { success: true, count };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async cleanupLegacyCosmeticsPreview(userId: string, fantasySeasonId: string | null): Promise<{ success: boolean; removed?: number; error?: string }> {
    const result = await this.runOwnCleanup(userId, fantasySeasonId, "cleanup_my_cosmetics_preview");
    return result.success ? { success: true, removed: result.count } : { success: false, error: result.error };
  }

  async dismissUnopenedBronzePassPack(userId: string, fantasySeasonId: string | null): Promise<{ success: boolean; dismissed?: number; error?: string }> {
    const result = await this.runOwnCleanup(userId, fantasySeasonId, "dismiss_my_unopened_bronze_pass_pack");
    return result.success ? { success: true, dismissed: result.count } : { success: false, error: result.error };
  }

  async resetTestPassRewardClaims(params: {
    userId: string;
    fantasySeasonId: string;
    selectedFantasySeasonId: string | null;
  }): Promise<{ success: boolean; removed?: number; error?: string }> {
    if (!params.fantasySeasonId || params.fantasySeasonId !== params.selectedFantasySeasonId) {
      return { success: false, error: "Passe da pelada selecionada não encontrado." };
    }
    const result = await this.runOwnCleanup(params.userId, params.fantasySeasonId, "reset_my_test_pass_cosmetic_claims");
    return result.success ? { success: true, removed: result.count } : { success: false, error: result.error };
  }
}
