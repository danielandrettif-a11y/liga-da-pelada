import type { Pool } from "pg";
import type { CardsRepository } from "../application/manage-cards.js";
import type {
  FantasyActiveCardDTO,
  FantasyCardDefinition,
  FantasyPackDTO,
  FantasyUserCardDTO,
} from "../domain/cards.js";

const DEFAULT_DEFINITIONS: FantasyCardDefinition[] = [
  { slug: "luva-de-ouro", name: "Luva de Ouro", description: "Bônus para goleiro", rarity: "rare", cost: 0, requiresTargetPlayer: true },
  { slug: "artilheiro-nato", name: "Artilheiro Nato", description: "Bônus para atacante", rarity: "rare", cost: 0, requiresTargetPlayer: true },
  { slug: "muralha-defensiva", name: "Muralha Defensiva", description: "Bônus para zagueiro", rarity: "common", cost: 0, requiresTargetPlayer: false },
  { slug: "maestro-do-meio", name: "Maestro do Meio", description: "Bônus para meia", rarity: "common", cost: 0, requiresTargetPlayer: true },
];

export class PgCardsRepository implements CardsRepository {
  constructor(private readonly pool: Pool) {}

  private async withClient<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("SET LOCAL ROLE authenticated");
      return await callback(client);
    } finally {
      client.release();
    }
  }

  async isLeagueAdmin(leagueId: string, userId: string): Promise<boolean> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT 1 FROM league_members
         WHERE league_id = $1 AND user_id = $2 AND role IN ('admin', 'owner')
         LIMIT 1`,
        [leagueId, userId]
      );
      if (rows.length > 0) return true;

      const leagueRes = await client.query(
        `SELECT 1 FROM leagues WHERE id = $1 AND created_by = $2 LIMIT 1`,
        [leagueId, userId]
      );
      return (leagueRes.rowCount ?? 0) > 0;
    });
  }

  async getMyPacks(leagueId: string, userId: string): Promise<{
    availablePacks: FantasyPackDTO[];
    claimedCount: number;
    totalPacks: number;
  }> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT id, user_id, league_id, status, card_slug_offer_1, card_slug_offer_2, created_at
         FROM fantasy_packs
         WHERE league_id = $1 AND user_id = $2
         ORDER BY created_at DESC`,
        [leagueId, userId]
      );

      const allPacks: FantasyPackDTO[] = rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        leagueId: r.league_id,
        status: r.status,
        cardSlugOffer1: r.card_slug_offer_1,
        cardSlugOffer2: r.card_slug_offer_2,
        createdAt: r.created_at,
      }));

      const availablePacks = allPacks.filter((p) => p.status !== "claimed");
      const claimedCount = allPacks.filter((p) => p.status === "claimed").length;

      return {
        availablePacks,
        claimedCount,
        totalPacks: allPacks.length,
      };
    });
  }

  async restoreMyPassPacks(leagueId: string, userId: string, fantasySeasonId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      await client.query(
        `INSERT INTO fantasy_packs (league_id, user_id, status, created_at)
         VALUES ($1, $2, 'unopened', NOW())`,
        [leagueId, userId]
      );
      return { success: true };
    });
  }

  async openPack(leagueId: string, userId: string, packId: string): Promise<{
    success: boolean;
    offers?: [FantasyCardDefinition, FantasyCardDefinition];
    error?: string;
  }> {
    return this.withClient(async (client) => {
      const packRes = await client.query(
        `SELECT id, status FROM fantasy_packs WHERE id = $1 AND user_id = $2 AND league_id = $3 LIMIT 1`,
        [packId, userId, leagueId]
      );
      if (packRes.rows.length === 0) return { success: false, error: "Pacote não encontrado." };

      const offer1 = DEFAULT_DEFINITIONS[0]!;
      const offer2 = DEFAULT_DEFINITIONS[1]!;

      await client.query(
        `UPDATE fantasy_packs
         SET status = 'opened', card_slug_offer_1 = $1, card_slug_offer_2 = $2, updated_at = NOW()
         WHERE id = $3`,
        [offer1.slug, offer2.slug, packId]
      );

      return {
        success: true,
        offers: [offer1, offer2],
      };
    });
  }

  async getPackById(leagueId: string, packId: string): Promise<FantasyPackDTO | null> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT id, user_id, league_id, status, card_slug_offer_1, card_slug_offer_2, created_at
         FROM fantasy_packs WHERE id = $1 AND league_id = $2 LIMIT 1`,
        [packId, leagueId]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        leagueId: r.league_id,
        status: r.status,
        cardSlugOffer1: r.card_slug_offer_1,
        cardSlugOffer2: r.card_slug_offer_2,
        createdAt: r.created_at,
      };
    });
  }

  async claimPackCard(
    leagueId: string,
    userId: string,
    packId: string,
    chosenSlug: string
  ): Promise<{ success: boolean; error?: string; chosenCard?: FantasyCardDefinition }> {
    return this.withClient(async (client) => {
      await client.query(
        `UPDATE fantasy_packs SET status = 'claimed', updated_at = NOW() WHERE id = $1 AND league_id = $2`,
        [packId, leagueId]
      );

      await client.query(
        `INSERT INTO fantasy_user_cards (league_id, user_id, card_slug, status, acquired_at)
         VALUES ($1, $2, $3, 'available', NOW())`,
        [leagueId, userId, chosenSlug]
      );

      const card = DEFAULT_DEFINITIONS.find((d) => d.slug === chosenSlug) ?? {
        slug: chosenSlug,
        name: chosenSlug,
        description: "",
        rarity: "common",
        cost: 0,
      };

      return { success: true, chosenCard: card };
    });
  }

  async getMyInventory(leagueId: string, userId: string): Promise<{
    cards: FantasyUserCardDTO[];
    groupedBySlug: Record<string, { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }>;
  }> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT id, user_id, card_slug, status, acquired_at
         FROM fantasy_user_cards
         WHERE league_id = $1 AND user_id = $2
         ORDER BY acquired_at DESC`,
        [leagueId, userId]
      );

      const cards: FantasyUserCardDTO[] = rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        cardSlug: r.card_slug,
        status: r.status,
        acquiredAt: r.acquired_at,
      }));

      const groupedBySlug: Record<string, { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }> = {};
      for (const card of cards) {
        if (!groupedBySlug[card.cardSlug]) {
          const def = DEFAULT_DEFINITIONS.find((d) => d.slug === card.cardSlug) ?? {
            slug: card.cardSlug,
            name: card.cardSlug,
            description: "",
            rarity: "common",
            cost: 0,
          };
          groupedBySlug[card.cardSlug] = { count: 0, card: def, instances: [] };
        }
        groupedBySlug[card.cardSlug]!.count += 1;
        groupedBySlug[card.cardSlug]!.instances.push(card);
      }

      return { cards, groupedBySlug };
    });
  }

  async getMyInventoryCount(leagueId: string, userId: string): Promise<number> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int as count FROM fantasy_user_cards WHERE league_id = $1 AND user_id = $2`,
        [leagueId, userId]
      );
      return rows[0]?.count ?? 0;
    });
  }

  async getActiveCardForRound(leagueId: string, userId: string, roundId: string): Promise<FantasyActiveCardDTO | null> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT id, user_id, round_id, card_slug, target_player_id, target_player_2_id, target_prediction, applied_at
         FROM fantasy_active_cards
         WHERE round_id = $1 AND user_id = $2 LIMIT 1`,
        [roundId, userId]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        roundId: r.round_id,
        cardSlug: r.card_slug,
        targetPlayerId: r.target_player_id,
        targetPlayer2Id: r.target_player_2_id,
        targetPrediction: r.target_prediction,
        appliedAt: r.applied_at,
      };
    });
  }

  async getCardDefinition(cardSlug: string): Promise<FantasyCardDefinition | null> {
    return DEFAULT_DEFINITIONS.find((d) => d.slug === cardSlug) ?? {
      slug: cardSlug,
      name: cardSlug,
      description: "",
      rarity: "common",
      cost: 0,
    };
  }

  async isRoundOpen(leagueId: string, roundId: string): Promise<boolean> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT status, market_status FROM rounds WHERE id = $1 AND league_id = $2 LIMIT 1`,
        [roundId, leagueId]
      );
      if (rows.length === 0) return false;
      const r = rows[0];
      return r.market_status === "open" || r.status === "draft";
    });
  }

  async activateCardForRound(params: {
    leagueId: string;
    userId: string;
    roundId: string;
    userCardId: string;
    targetPlayerId?: string | null;
    targetPlayer2Id?: string | null;
    targetPrediction?: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      const cardRes = await client.query(
        `SELECT card_slug FROM fantasy_user_cards WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [params.userCardId, params.userId]
      );
      const cardSlug = cardRes.rows[0]?.card_slug ?? "carta";

      await client.query(
        `INSERT INTO fantasy_active_cards (round_id, user_id, card_slug, target_player_id, target_player_2_id, target_prediction, applied_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (round_id, user_id)
         DO UPDATE SET card_slug = EXCLUDED.card_slug, target_player_id = EXCLUDED.target_player_id, applied_at = NOW()`,
        [
          params.roundId,
          params.userId,
          cardSlug,
          params.targetPlayerId ?? null,
          params.targetPlayer2Id ?? null,
          params.targetPrediction ?? null,
        ]
      );

      return { success: true };
    });
  }

  async removeActiveCardForRound(leagueId: string, userId: string, roundId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      await client.query(
        `DELETE FROM fantasy_active_cards WHERE round_id = $1 AND user_id = $2`,
        [roundId, userId]
      );
      return { success: true };
    });
  }

  async generatePacksForFinishedRound(leagueId: string, roundId: string): Promise<number> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT DISTINCT user_id FROM fantasy_lineups WHERE round_id = $1`,
        [roundId]
      );
      for (const row of rows) {
        await client.query(
          `INSERT INTO fantasy_packs (league_id, user_id, status, created_at)
           VALUES ($1, $2, 'unopened', NOW())`,
          [leagueId, row.user_id]
        );
      }
      return rows.length;
    });
  }

  async giveMyAccountTestPack(leagueId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      await client.query(
        `INSERT INTO fantasy_packs (league_id, user_id, status, created_at)
         VALUES ($1, $2, 'unopened', NOW())`,
        [leagueId, userId]
      );
      return { success: true };
    });
  }

  async resetMyAccountCards(leagueId: string, userId: string): Promise<{
    success: boolean;
    deletedCardsCount?: number;
    deletedActivationsCount?: number;
    deletedPacksCount?: number;
    error?: string;
  }> {
    return this.withClient(async (client) => {
      const pRes = await client.query(`DELETE FROM fantasy_packs WHERE league_id = $1 AND user_id = $2`, [leagueId, userId]);
      const cRes = await client.query(`DELETE FROM fantasy_user_cards WHERE league_id = $1 AND user_id = $2`, [leagueId, userId]);
      const aRes = await client.query(`DELETE FROM fantasy_active_cards WHERE user_id = $1`, [userId]);

      return {
        success: true,
        deletedPacksCount: pRes.rowCount ?? 0,
        deletedCardsCount: cRes.rowCount ?? 0,
        deletedActivationsCount: aRes.rowCount ?? 0,
      };
    });
  }

  async distributePackToAllLineupUsers(leagueId: string): Promise<{
    success: boolean;
    awardedUsersCount?: number;
    roundNumber?: number;
    error?: string;
  }> {
    return this.withClient(async (client) => {
      const rRes = await client.query(
        `SELECT id, round_number FROM rounds WHERE league_id = $1 ORDER BY round_number DESC LIMIT 1`,
        [leagueId]
      );
      const round = rRes.rows[0];
      if (!round) return { success: false, error: "Nenhuma rodada encontrada." };

      const count = await this.generatePacksForFinishedRound(leagueId, round.id);
      return {
        success: true,
        awardedUsersCount: count,
        roundNumber: Number(round.round_number),
      };
    });
  }

  async auditAndRepairCurrentSeasonPacks(leagueId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      return { success: true };
    });
  }

  async grantFantasyPackToUser(leagueId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      await client.query(
        `INSERT INTO fantasy_packs (league_id, user_id, status, created_at)
         VALUES ($1, $2, 'unopened', NOW())`,
        [leagueId, targetUserId]
      );
      return { success: true };
    });
  }
}
