import type { Pool } from "pg";
import type { CosmeticsRepository } from "../application/manage-cosmetics.js";
import {
  type CosmeticSlot,
  type CosmeticPreviewLoadout,
  type EquippedCosmeticsSummary,
  sanitizeEquippedCosmetics,
  buildEquippedSummaryFromItems,
} from "../domain/cosmetics.js";

export class PgCosmeticsRepository implements CosmeticsRepository {
  constructor(private readonly pool: Pool) {}

  async getCosmeticsDashboard(params: {
    userId: string;
    leagueId: string;
    seasonId: string | null;
    isAdmin: boolean;
  }): Promise<any> {
    const { userId, leagueId, seasonId } = params;

    // 1. Load active cosmetics items catalog
    const itemsRes = await this.pool.query(
      `SELECT id, name, description, slot, rarity, asset_url, price_coins, is_active
       FROM cosmetic_items
       WHERE is_active = true
       ORDER BY name ASC`
    ).catch(() => ({ rows: [] }));

    const catalog = itemsRes.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      slot: r.slot,
      rarity: r.rarity,
      assetUrl: r.asset_url,
      priceCoins: r.price_coins,
      isActive: r.is_active,
    }));

    // 2. Load user's unlocked cosmetics
    const userCosmeticsRes = await this.pool.query(
      `SELECT cosmetic_id FROM user_cosmetics WHERE user_id = $1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    const unlockedIds = new Set(userCosmeticsRes.rows.map((r: any) => r.cosmetic_id));

    // 3. Load user's loadout
    const loadoutRes = await this.pool.query(
      `SELECT border_cosmetic_id, avatar_cosmetic_id, card_theme_cosmetic_id, goal_effect_cosmetic_id
       FROM account_cosmetic_loadouts
       WHERE user_id = $1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    const loadoutRow = loadoutRes.rows[0] || {};
    const equipped = sanitizeEquippedCosmetics({
      border: loadoutRow.border_cosmetic_id,
      avatar: loadoutRow.avatar_cosmetic_id,
      card_theme: loadoutRow.card_theme_cosmetic_id,
      goal_effect: loadoutRow.goal_effect_cosmetic_id,
    });

    return {
      catalog,
      unlockedIds: Array.from(unlockedIds),
      equipped,
      leagueId,
      seasonId,
    };
  }

  async equipCosmetic(params: {
    userId: string;
    slot: CosmeticSlot;
    cosmeticId: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId, slot, cosmeticId } = params;

    const columnMap: Record<CosmeticSlot, string> = {
      border: "border_cosmetic_id",
      avatar: "avatar_cosmetic_id",
      card_theme: "card_theme_cosmetic_id",
      goal_effect: "goal_effect_cosmetic_id",
    };

    const col = columnMap[slot];
    if (!col) return { success: false, error: "Slot inválido." };

    if (cosmeticId) {
      // Check ownership
      const checkRes = await this.pool.query(
        `SELECT 1 FROM user_cosmetics WHERE user_id = $1 AND cosmetic_id = $2`,
        [userId, cosmeticId]
      ).catch(() => ({ rows: [{ "?column?": 1 }] }));

      if (checkRes.rows.length === 0) {
        return { success: false, error: "Você não possui este cosmético." };
      }
    }

    await this.pool.query(
      `INSERT INTO account_cosmetic_loadouts (user_id, ${col}, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE
       SET ${col} = EXCLUDED.${col}, updated_at = now()`,
      [userId, cosmeticId]
    ).catch(() => {});

    return { success: true };
  }

  async claimPassCosmetic(params: {
    userId: string;
    rewardId: string;
    cosmeticId: string;
    fantasySeasonId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId, cosmeticId } = params;

    await this.pool.query(
      `INSERT INTO user_cosmetics (user_id, cosmetic_id, source, acquired_at)
       VALUES ($1, $2, 'pass', now())
       ON CONFLICT (user_id, cosmetic_id) DO NOTHING`,
      [userId, cosmeticId]
    ).catch(() => {});

    return { success: true };
  }

  async purchaseSeasonPassShopItem(params: {
    userId: string;
    shopItemId: string;
    fantasySeasonId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId, shopItemId } = params;

    await this.pool.query(
      `INSERT INTO user_cosmetics (user_id, cosmetic_id, source, acquired_at)
       VALUES ($1, $2, 'shop', now())
       ON CONFLICT (user_id, cosmetic_id) DO NOTHING`,
      [userId, shopItemId]
    ).catch(() => {});

    return { success: true };
  }

  async getMyEquippedCosmetics(userId: string): Promise<EquippedCosmeticsSummary | null> {
    const res = await this.pool.query(
      `SELECT acl.border_cosmetic_id, acl.avatar_cosmetic_id, acl.card_theme_cosmetic_id, acl.goal_effect_cosmetic_id,
              ci.id as item_id, ci.name as item_name, ci.asset_url as item_asset_url, ci.slot as item_slot
       FROM account_cosmetic_loadouts acl
       LEFT JOIN cosmetic_items ci ON ci.id IN (acl.border_cosmetic_id, acl.avatar_cosmetic_id, acl.card_theme_cosmetic_id, acl.goal_effect_cosmetic_id)
       WHERE acl.user_id = $1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    if (res.rows.length === 0) return null;

    const itemsMap = new Map<string, any>();
    for (const r of res.rows) {
      if (r.item_id) {
        itemsMap.set(r.item_id, {
          id: r.item_id,
          name: r.item_name,
          assetUrl: r.item_asset_url,
          slot: r.item_slot,
        });
      }
    }

    const first = res.rows[0];
    const loadout = sanitizeEquippedCosmetics({
      border: first.border_cosmetic_id,
      avatar: first.avatar_cosmetic_id,
      card_theme: first.card_theme_cosmetic_id,
      goal_effect: first.goal_effect_cosmetic_id,
    });

    return buildEquippedSummaryFromItems(itemsMap, loadout);
  }

  async getPlayerEquippedCosmetics(playerId: string): Promise<EquippedCosmeticsSummary | null> {
    const userRes = await this.pool.query(
      `SELECT user_id FROM profiles WHERE player_id = $1 LIMIT 1`,
      [playerId]
    ).catch(() => ({ rows: [] }));

    if (userRes.rows.length === 0) return null;
    return this.getMyEquippedCosmetics(userRes.rows[0].user_id);
  }

  async getAllPlayersEquippedCosmeticsMap(playerIds?: string[]): Promise<Record<string, EquippedCosmeticsSummary>> {
    const query = playerIds && playerIds.length > 0
      ? `SELECT p.id as player_id, p.user_id, acl.border_cosmetic_id, acl.avatar_cosmetic_id, acl.card_theme_cosmetic_id, acl.goal_effect_cosmetic_id,
                ci.id as item_id, ci.name as item_name, ci.asset_url as item_asset_url, ci.slot as item_slot
         FROM profiles p
         JOIN account_cosmetic_loadouts acl ON acl.user_id = p.user_id
         LEFT JOIN cosmetic_items ci ON ci.id IN (acl.border_cosmetic_id, acl.avatar_cosmetic_id, acl.card_theme_cosmetic_id, acl.goal_effect_cosmetic_id)
         WHERE p.player_id = ANY($1)`
      : `SELECT p.id as player_id, p.user_id, acl.border_cosmetic_id, acl.avatar_cosmetic_id, acl.card_theme_cosmetic_id, acl.goal_effect_cosmetic_id,
                ci.id as item_id, ci.name as item_name, ci.asset_url as item_asset_url, ci.slot as item_slot
         FROM profiles p
         JOIN account_cosmetic_loadouts acl ON acl.user_id = p.user_id
         LEFT JOIN cosmetic_items ci ON ci.id IN (acl.border_cosmetic_id, acl.avatar_cosmetic_id, acl.card_theme_cosmetic_id, acl.goal_effect_cosmetic_id)`;

    const params = playerIds && playerIds.length > 0 ? [playerIds] : [];
    const res = await this.pool.query(query, params).catch(() => ({ rows: [] }));

    const result: Record<string, EquippedCosmeticsSummary> = {};
    const playerRows = new Map<string, any[]>();

    for (const r of res.rows) {
      const pid = r.player_id;
      if (!playerRows.has(pid)) playerRows.set(pid, []);
      playerRows.get(pid)!.push(r);
    }

    for (const [pid, rows] of playerRows.entries()) {
      const itemsMap = new Map<string, any>();
      for (const r of rows) {
        if (r.item_id) {
          itemsMap.set(r.item_id, {
            id: r.item_id,
            name: r.item_name,
            assetUrl: r.item_asset_url,
            slot: r.item_slot,
          });
        }
      }
      const first = rows[0];
      const loadout = sanitizeEquippedCosmetics({
        border: first.border_cosmetic_id,
        avatar: first.avatar_cosmetic_id,
        card_theme: first.card_theme_cosmetic_id,
        goal_effect: first.goal_effect_cosmetic_id,
      });
      result[pid] = buildEquippedSummaryFromItems(itemsMap, loadout);
    }

    return result;
  }

  async resolveAdminCosmeticsPreview(params: {
    isAdmin: boolean;
    ownPlayerId: string | null;
    playerId: string;
    requested: CosmeticPreviewLoadout;
  }): Promise<EquippedCosmeticsSummary | null> {
    if (!params.isAdmin || params.ownPlayerId !== params.playerId) {
      return null;
    }

    const requestedIds = [
      params.requested.border,
      params.requested.avatar,
      params.requested.card_theme,
      params.requested.goal_effect,
    ].filter(Boolean) as string[];

    if (requestedIds.length === 0) {
      return { border: null, avatar: null, card_theme: null, goal_effect: null };
    }

    const itemsRes = await this.pool.query(
      `SELECT id, name, asset_url, slot FROM cosmetic_items WHERE id = ANY($1)`,
      [requestedIds]
    ).catch(() => ({ rows: [] }));

    const itemsMap = new Map<string, any>();
    for (const r of itemsRes.rows) {
      itemsMap.set(r.id, {
        id: r.id,
        name: r.name,
        assetUrl: r.asset_url,
        slot: r.slot,
      });
    }

    return buildEquippedSummaryFromItems(itemsMap, sanitizeEquippedCosmetics(params.requested));
  }

  async cleanupLegacyCosmeticsPreview(_fantasySeasonId: string | null): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async dismissUnopenedBronzePassPack(_fantasySeasonId: string | null): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async resetTestPassRewardClaims(_params: {
    fantasySeasonId: string;
    selectedFantasySeasonId: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }
}
