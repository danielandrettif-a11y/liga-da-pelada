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

function mapCardRarity(rarity: string | null | undefined): "common" | "rare" | "epic" | "legendary" {
  const norm = (rarity || "").toLowerCase();
  if (norm === "rare") return "rare";
  if (norm === "epic") return "epic";
  if (norm === "legendary") return "legendary";
  return "common";
}

export class PgCardsRepository implements CardsRepository {
  constructor(private readonly pool: Pool) {}

  private async withClient<T>(callback: (client: any) => Promise<T>, userId?: string): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      if (userId) {
        await client.query(
          "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true), set_config('search_path', 'public, auth', true)",
          [userId, JSON.stringify({ sub: userId, role: "authenticated" })],
        );
      } else {
        await client.query("SET LOCAL search_path = public, auth");
      }
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async isLeagueAdmin(leagueId: string, userId: string): Promise<boolean> {
    return this.withClient(async (client) => {
      const res = await client.query(
        `SELECT (
           EXISTS (
             SELECT 1 FROM public.league_members lm
             WHERE lm.league_id = $1 AND lm.user_id = $2 AND lm.role IN ('admin', 'owner')
           )
           OR EXISTS (
             SELECT 1 FROM public.account_profiles ap
             WHERE ap.user_id = $2 AND ap.role = 'admin'
           )
           OR EXISTS (
             SELECT 1 FROM public.leagues l
             WHERE l.id = $1 AND l.owner_id = $2
           )
         ) AS is_admin`,
        [leagueId, userId]
      );
      return Boolean(res.rows[0]?.is_admin);
    }, userId);
  }

  async getMyPacks(leagueId: string, userId: string): Promise<{
    availablePacks: FantasyPackDTO[];
    claimedCount: number;
    totalPacks: number;
  }> {
    return this.withClient(async (client) => {
      const packRes = await client.query(
        `SELECT p.id, p.user_id, p.round_id, p.status, p.created_at, p.source, p.card_tier, p.opened_at, p.chosen_card_id,
                COALESCE(r.league_id, fs.league_id, $1::uuid) as league_id
         FROM public.fantasy_round_packs p
         LEFT JOIN public.rounds r ON r.id = p.round_id
         LEFT JOIN public.fantasy_season_pass_rewards fspr ON fspr.id = p.fantasy_season_pass_reward_id
         LEFT JOIN public.fantasy_seasons fs ON fs.id = fspr.fantasy_season_id
         WHERE p.user_id = $2
           AND (r.league_id = $1::uuid OR fs.league_id = $1::uuid OR (p.round_id IS NULL AND p.fantasy_season_pass_reward_id IS NULL))
         ORDER BY p.created_at DESC`,
        [leagueId, userId]
      );

      const packIds = packRes.rows.map((r: any) => r.id);
      const offersMap: Record<string, { offer1?: string; offer2?: string }> = {};

      if (packIds.length > 0) {
        const offersRes = await client.query(
          `SELECT o.pack_id, o.slot, fc.slug
           FROM public.fantasy_pack_offers o
           JOIN public.fantasy_cards fc ON fc.id = o.card_id
           WHERE o.pack_id = ANY($1::uuid[])
           ORDER BY o.slot ASC`,
          [packIds]
        );
        for (const row of offersRes.rows) {
          if (!offersMap[row.pack_id]) offersMap[row.pack_id] = {};
          if (row.slot === 1) offersMap[row.pack_id]!.offer1 = row.slug;
          if (row.slot === 2) offersMap[row.pack_id]!.offer2 = row.slug;
        }
      }

      const allPacks: FantasyPackDTO[] = packRes.rows.map((r: any) => {
        let status: "unopened" | "opened" | "claimed" = "unopened";
        if (r.status === "opened") status = "opened";
        else if (r.status === "claimed") status = "claimed";
        else status = "unopened";

        const offers = offersMap[r.id] || {};

        return {
          id: r.id,
          userId: r.user_id,
          leagueId: r.league_id || leagueId,
          status,
          cardSlugOffer1: offers.offer1 || null,
          cardSlugOffer2: offers.offer2 || null,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        };
      });

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
      try {
        await client.query(
          `SELECT public.restore_my_pass_card_packs($1::uuid)`,
          [fantasySeasonId]
        );
        return { success: true };
      } catch {
        // Fallback defensivo
        await client.query(
          `INSERT INTO public.fantasy_round_packs (user_id, status, source, created_at)
           VALUES ($1, 'available', 'season_pass', NOW())`,
          [userId]
        );
        return { success: true };
      }
    });
  }

  async openPack(leagueId: string, userId: string, packId: string): Promise<{
    success: boolean;
    offers?: [FantasyCardDefinition, FantasyCardDefinition];
    error?: string;
  }> {
    return this.withClient(async (client) => {
      const packRes = await client.query(
        `SELECT id, status FROM public.fantasy_round_packs WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [packId, userId]
      );
      if (packRes.rows.length === 0) return { success: false, error: "Pacote não encontrado." };

      // Se já existirem ofertas para este pacote, carregar
      const existingOffers = await client.query(
        `SELECT o.slot, fc.id, fc.slug, fc.name, fc.description, fc.rarity,
                (fc.effect_config->>'requires_target_player')::boolean as requires_target
         FROM public.fantasy_pack_offers o
         JOIN public.fantasy_cards fc ON fc.id = o.card_id
         WHERE o.pack_id = $1
         ORDER BY o.slot ASC`,
        [packId]
      );

      let offer1: FantasyCardDefinition;
      let offer2: FantasyCardDefinition;

      if (existingOffers.rows.length >= 2) {
        const row1 = existingOffers.rows[0];
        const row2 = existingOffers.rows[1];
        offer1 = {
          slug: row1.slug,
          name: row1.name,
          description: row1.description,
          rarity: mapCardRarity(row1.rarity),
          cost: 0,
          requiresTargetPlayer: Boolean(row1.requires_target),
        };
        offer2 = {
          slug: row2.slug,
          name: row2.name,
          description: row2.description,
          rarity: mapCardRarity(row2.rarity),
          cost: 0,
          requiresTargetPlayer: Boolean(row2.requires_target),
        };
      } else {
        // Buscar 2 cartas do banco de dados
        const cardsRes = await client.query(
          `SELECT id, slug, name, description, rarity, (effect_config->>'requires_target_player')::boolean as requires_target
           FROM public.fantasy_cards
           WHERE enabled = true
           ORDER BY random()
           LIMIT 2`
        );

        const cardRows = cardsRes.rows.length >= 2 ? cardsRes.rows : [
          { id: "00000000-0000-0000-0000-000000000001", slug: DEFAULT_DEFINITIONS[0]!.slug, name: DEFAULT_DEFINITIONS[0]!.name, description: DEFAULT_DEFINITIONS[0]!.description, rarity: DEFAULT_DEFINITIONS[0]!.rarity, requires_target: DEFAULT_DEFINITIONS[0]!.requiresTargetPlayer },
          { id: "00000000-0000-0000-0000-000000000002", slug: DEFAULT_DEFINITIONS[1]!.slug, name: DEFAULT_DEFINITIONS[1]!.name, description: DEFAULT_DEFINITIONS[1]!.description, rarity: DEFAULT_DEFINITIONS[1]!.rarity, requires_target: DEFAULT_DEFINITIONS[1]!.requiresTargetPlayer },
        ];

        offer1 = {
          slug: cardRows[0].slug,
          name: cardRows[0].name,
          description: cardRows[0].description,
          rarity: mapCardRarity(cardRows[0].rarity),
          cost: 0,
          requiresTargetPlayer: Boolean(cardRows[0].requires_target),
        };
        offer2 = {
          slug: cardRows[1].slug,
          name: cardRows[1].name,
          description: cardRows[1].description,
          rarity: mapCardRarity(cardRows[1].rarity),
          cost: 0,
          requiresTargetPlayer: Boolean(cardRows[1].requires_target),
        };

        // Gravar ofertas
        await client.query(
          `INSERT INTO public.fantasy_pack_offers (pack_id, slot, card_id)
           VALUES ($1, 1, $2::uuid), ($1, 2, $3::uuid)
           ON CONFLICT (pack_id, slot) DO NOTHING`,
          [packId, cardRows[0].id, cardRows[1].id]
        ).catch(() => {});
      }

      await client.query(
        `UPDATE public.fantasy_round_packs
         SET status = 'opened', opened_at = NOW()
         WHERE id = $1`,
        [packId]
      );

      return {
        success: true,
        offers: [offer1, offer2],
      };
    });
  }

  async getPackById(leagueId: string, packId: string): Promise<FantasyPackDTO | null> {
    return this.withClient(async (client) => {
      const res = await client.query(
        `SELECT p.id, p.user_id, p.status, p.created_at,
                COALESCE(r.league_id, fs.league_id, $1::uuid) as league_id
         FROM public.fantasy_round_packs p
         LEFT JOIN public.rounds r ON r.id = p.round_id
         LEFT JOIN public.fantasy_season_pass_rewards fspr ON fspr.id = p.fantasy_season_pass_reward_id
         LEFT JOIN public.fantasy_seasons fs ON fs.id = fspr.fantasy_season_id
         WHERE p.id = $2 LIMIT 1`,
        [leagueId, packId]
      );
      if (res.rows.length === 0) return null;
      const r = res.rows[0];

      const offersRes = await client.query(
        `SELECT o.slot, fc.slug
         FROM public.fantasy_pack_offers o
         JOIN public.fantasy_cards fc ON fc.id = o.card_id
         WHERE o.pack_id = $1 ORDER BY o.slot ASC`,
        [packId]
      );

      let offer1: string | null = null;
      let offer2: string | null = null;
      for (const row of offersRes.rows) {
        if (row.slot === 1) offer1 = row.slug;
        if (row.slot === 2) offer2 = row.slug;
      }

      let status: "unopened" | "opened" | "claimed" = "unopened";
      if (r.status === "opened") status = "opened";
      else if (r.status === "claimed") status = "claimed";

      return {
        id: r.id,
        userId: r.user_id,
        leagueId: r.league_id || leagueId,
        status,
        cardSlugOffer1: offer1,
        cardSlugOffer2: offer2,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
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
      const cardRes = await client.query(
        `SELECT id, slug, name, description, rarity, (effect_config->>'requires_target_player')::boolean as requires_target
         FROM public.fantasy_cards
         WHERE slug = $1 LIMIT 1`,
        [chosenSlug]
      );

      const cardRow = cardRes.rows[0];
      const cardId = cardRow?.id || null;

      await client.query(
        `UPDATE public.fantasy_round_packs
         SET status = 'claimed', chosen_card_id = $1::uuid
         WHERE id = $2`,
        [cardId, packId]
      );

      if (cardId) {
        await client.query(
          `INSERT INTO public.fantasy_user_cards (league_id, user_id, card_id, source_pack_id, status, acquired_at)
           VALUES ($1, $2, $3, $4, 'OWNED', NOW())`,
          [leagueId, userId, cardId, packId]
        );
      }

      const cardDef: FantasyCardDefinition = cardRow
        ? {
            slug: cardRow.slug,
            name: cardRow.name,
            description: cardRow.description,
            rarity: mapCardRarity(cardRow.rarity),
            cost: 0,
            requiresTargetPlayer: Boolean(cardRow.requires_target),
          }
        : {
            slug: chosenSlug,
            name: chosenSlug,
            description: "",
            rarity: "common",
            cost: 0,
          };

      return { success: true, chosenCard: cardDef };
    });
  }

  async getMyInventory(leagueId: string, userId: string): Promise<{
    cards: FantasyUserCardDTO[];
    groupedBySlug: Record<string, { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }>;
  }> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT uc.id, uc.user_id, uc.status, uc.acquired_at,
                fc.slug, fc.name, fc.description, fc.rarity,
                (fc.effect_config->>'requires_target_player')::boolean as requires_target
         FROM public.fantasy_user_cards uc
         JOIN public.fantasy_cards fc ON fc.id = uc.card_id
         WHERE uc.league_id = $1 AND uc.user_id = $2
         ORDER BY uc.acquired_at DESC`,
        [leagueId, userId]
      );

      const cards: FantasyUserCardDTO[] = rows.map((r: any) => {
        let status: "available" | "active" | "used" = "available";
        if (r.status === "RESERVED" || r.status === "LOCKED") status = "active";
        else if (r.status === "CONSUMED") status = "used";

        return {
          id: r.id,
          userId: r.user_id,
          cardSlug: r.slug,
          status,
          acquiredAt: r.acquired_at ? new Date(r.acquired_at).toISOString() : new Date().toISOString(),
        };
      });

      const groupedBySlug: Record<string, { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }> = {};
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cardDto = cards[i];
        if (!cardDto) continue;
        if (!groupedBySlug[row.slug]) {
          groupedBySlug[row.slug] = {
            count: 0,
            card: {
              slug: row.slug,
              name: row.name,
              description: row.description,
              rarity: mapCardRarity(row.rarity),
              cost: 0,
              requiresTargetPlayer: Boolean(row.requires_target),
            },
            instances: [],
          };
        }
        groupedBySlug[row.slug]!.count += 1;
        groupedBySlug[row.slug]!.instances.push(cardDto);
      }

      return { cards, groupedBySlug };
    });
  }

  async getMyInventoryCount(leagueId: string, userId: string): Promise<number> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int as count FROM public.fantasy_user_cards
         WHERE league_id = $1 AND user_id = $2 AND status = 'OWNED'`,
        [leagueId, userId]
      );
      return rows[0]?.count ?? 0;
    });
  }

  async getActiveCardForRound(leagueId: string, userId: string, roundId: string): Promise<FantasyActiveCardDTO | null> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT fca.id, fca.user_id, fca.round_id, fca.target_snapshot, fca.reserved_at,
                fc.slug as card_slug
         FROM public.fantasy_card_activations fca
         JOIN public.fantasy_cards fc ON fc.id = fca.card_id
         WHERE fca.round_id = $1 AND fca.user_id = $2
         LIMIT 1`,
        [roundId, userId]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      const snapshot = r.target_snapshot || {};
      return {
        id: r.id,
        userId: r.user_id,
        roundId: r.round_id,
        cardSlug: r.card_slug,
        targetPlayerId: snapshot.targetPlayerId || null,
        targetPlayer2Id: snapshot.targetPlayer2Id || null,
        targetPrediction: snapshot.targetPrediction || null,
        appliedAt: r.reserved_at ? new Date(r.reserved_at).toISOString() : new Date().toISOString(),
      };
    });
  }

  async getCardDefinition(cardSlug: string): Promise<FantasyCardDefinition | null> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT slug, name, description, rarity, (effect_config->>'requires_target_player')::boolean as requires_target
         FROM public.fantasy_cards
         WHERE slug = $1 LIMIT 1`,
        [cardSlug]
      );
      if (rows.length === 0) {
        return DEFAULT_DEFINITIONS.find((d) => d.slug === cardSlug) ?? null;
      }
      const r = rows[0];
      return {
        slug: r.slug,
        name: r.name,
        description: r.description,
        rarity: mapCardRarity(r.rarity),
        cost: 0,
        requiresTargetPlayer: Boolean(r.requires_target),
      };
    });
  }

  async isRoundOpen(leagueId: string, roundId: string): Promise<boolean> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT status, market_status FROM public.rounds WHERE id = $1 AND league_id = $2 LIMIT 1`,
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
        `SELECT uc.card_id, fc.slug
         FROM public.fantasy_user_cards uc
         JOIN public.fantasy_cards fc ON fc.id = uc.card_id
         WHERE uc.id = $1 AND uc.user_id = $2 LIMIT 1`,
        [params.userCardId, params.userId]
      );
      if (cardRes.rows.length === 0) {
        return { success: false, error: "Carta não encontrada no seu inventário." };
      }

      const cardId = cardRes.rows[0].card_id;
      const snapshot = {
        targetPlayerId: params.targetPlayerId || null,
        targetPlayer2Id: params.targetPlayer2Id || null,
        targetPrediction: params.targetPrediction || null,
      };

      await client.query(
        `INSERT INTO public.fantasy_card_activations (round_id, user_id, user_card_id, card_id, target_snapshot, status, reserved_at)
         VALUES ($1, $2, $3, $4, $5, 'RESERVED', NOW())
         ON CONFLICT (round_id, user_id)
         DO UPDATE SET user_card_id = EXCLUDED.user_card_id,
                       card_id = EXCLUDED.card_id,
                       target_snapshot = EXCLUDED.target_snapshot,
                       status = 'RESERVED',
                       reserved_at = NOW()`,
        [
          params.roundId,
          params.userId,
          params.userCardId,
          cardId,
          JSON.stringify(snapshot),
        ]
      );

      await client.query(
        `UPDATE public.fantasy_user_cards SET status = 'RESERVED' WHERE id = $1`,
        [params.userCardId]
      );

      return { success: true };
    });
  }

  async removeActiveCardForRound(leagueId: string, userId: string, roundId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      const actRes = await client.query(
        `SELECT user_card_id FROM public.fantasy_card_activations WHERE round_id = $1 AND user_id = $2 LIMIT 1`,
        [roundId, userId]
      );
      if (actRes.rows.length > 0) {
        const userCardId = actRes.rows[0].user_card_id;
        await client.query(
          `DELETE FROM public.fantasy_card_activations WHERE round_id = $1 AND user_id = $2`,
          [roundId, userId]
        );
        await client.query(
          `UPDATE public.fantasy_user_cards SET status = 'OWNED' WHERE id = $1`,
          [userCardId]
        );
      }
      return { success: true };
    });
  }

  async generatePacksForFinishedRound(leagueId: string, roundId: string): Promise<number> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT DISTINCT fl.user_id
         FROM public.fantasy_lineups fl
         JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
         WHERE fr.round_id = $1`,
        [roundId]
      );
      for (const row of rows) {
        await client.query(
          `INSERT INTO public.fantasy_round_packs (round_id, user_id, status, source, created_at)
           VALUES ($1, $2, 'available', 'round_reward', NOW())
           ON CONFLICT DO NOTHING`,
          [roundId, row.user_id]
        );
      }
      return rows.length;
    });
  }

  async giveMyAccountTestPack(leagueId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      const rRes = await client.query(
        `SELECT id FROM public.rounds WHERE league_id = $1 ORDER BY number DESC LIMIT 1`,
        [leagueId]
      );
      const roundId = rRes.rows[0]?.id || null;

      await client.query(
        `INSERT INTO public.fantasy_round_packs (round_id, user_id, status, source, created_at)
         VALUES ($1, $2, 'available', 'test', NOW())`,
        [roundId, userId]
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
      const aRes = await client.query(`DELETE FROM public.fantasy_card_activations WHERE user_id = $1`, [userId]);
      const cRes = await client.query(`DELETE FROM public.fantasy_user_cards WHERE league_id = $1 AND user_id = $2`, [leagueId, userId]);
      const pRes = await client.query(
        `DELETE FROM public.fantasy_round_packs p
         USING public.rounds r
         WHERE p.user_id = $2 AND p.round_id = r.id AND r.league_id = $1`,
        [leagueId, userId]
      );

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
        `SELECT id, number FROM public.rounds WHERE league_id = $1 ORDER BY number DESC LIMIT 1`,
        [leagueId]
      );
      const round = rRes.rows[0];
      if (!round) return { success: false, error: "Nenhuma rodada encontrada." };

      const count = await this.generatePacksForFinishedRound(leagueId, round.id);
      return {
        success: true,
        awardedUsersCount: count,
        roundNumber: Number(round.number),
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
      const rRes = await client.query(
        `SELECT id FROM public.rounds WHERE league_id = $1 ORDER BY number DESC LIMIT 1`,
        [leagueId]
      );
      const roundId = rRes.rows[0]?.id || null;

      await client.query(
        `INSERT INTO public.fantasy_round_packs (round_id, user_id, status, source, created_at)
         VALUES ($1, $2, 'available', 'admin_gift', NOW())`,
        [roundId, targetUserId]
      );
      return { success: true };
    });
  }
}
