import type { Pool } from "pg";
import type { CardsRepository } from "../application/manage-cards.js";
import type {
  FantasyActiveCardDTO,
  FantasyCardDefinition,
  FantasyPackDTO,
  FantasyUserCardDTO,
} from "../domain/cards.js";

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
        `SELECT public.is_league_admin($1::uuid) AS is_admin`,
        [leagueId]
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
        `SELECT p.id, p.user_id, p.round_id, p.status, p.created_at, p.source, p.card_tier, p.opened_at, p.chosen_card_id, r.number AS round_number,
                COALESCE(r.league_id, fs.league_id) as league_id
         FROM public.fantasy_round_packs p
         LEFT JOIN public.rounds r ON r.id = p.round_id
         LEFT JOIN public.fantasy_season_pass_rewards fspr ON fspr.id = p.fantasy_season_pass_reward_id
         LEFT JOIN public.fantasy_seasons fs ON fs.id = fspr.fantasy_season_id
         WHERE p.user_id = $2
           AND (r.league_id = $1::uuid OR fs.league_id = $1::uuid)
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
        let status: FantasyPackDTO["status"] = "available";
        if (r.status === "opened") status = "opened";
        else if (r.status === "claimed") status = "claimed";
        else if (r.status === "dismissed") status = "dismissed";

        const offers = offersMap[r.id] || {};

        return {
          id: r.id,
          userId: r.user_id,
          leagueId: r.league_id || leagueId,
          status,
          cardSlugOffer1: offers.offer1 || null,
          cardSlugOffer2: offers.offer2 || null,
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          roundId: r.round_id || null,
          roundNumber: r.round_number == null ? undefined : Number(r.round_number),
          source: r.source,
          cardTier: r.card_tier || null,
          openedAt: r.opened_at ? new Date(r.opened_at).toISOString() : null,
          chosenCardId: r.chosen_card_id || null,
        };
      });

      const availablePacks = allPacks.filter((p) => p.status === "available" || p.status === "opened");
      const claimedCount = allPacks.filter((p) => p.status === "claimed").length;

      return {
        availablePacks,
        claimedCount,
        totalPacks: allPacks.filter((p) => p.status !== "dismissed").length,
      };
    }, userId);
  }

  async restoreMyPassPacks(leagueId: string, userId: string, fantasySeasonId: string): Promise<{ success: boolean; restored?: number; error?: string }> {
    try {
      return await this.withClient(async (client) => {
        const season = await client.query("SELECT 1 FROM public.fantasy_seasons WHERE id=$1::uuid AND league_id=$2::uuid AND public.is_league_member(league_id)", [fantasySeasonId, leagueId]);
        if (!season.rowCount) return { success: false, error: "Passe não pertence à pelada selecionada." };
        const result = await client.query("SELECT public.restore_my_pass_card_packs($1::uuid) AS restored", [fantasySeasonId]);
        return { success: true, restored: Number(result.rows[0]?.restored || 0) };
      }, userId);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async openPack(leagueId: string, userId: string, packId: string): Promise<{
    success: boolean;
    offers?: [FantasyCardDefinition, FantasyCardDefinition];
    error?: string;
  }> {
    return this.withClient(async (client) => {
      const packRes = await client.query(
        `SELECT pack.id, pack.status, pack.card_tier FROM public.fantasy_round_packs pack
         LEFT JOIN public.rounds r ON r.id=pack.round_id
         LEFT JOIN public.fantasy_season_pass_rewards reward ON reward.id=pack.fantasy_season_pass_reward_id
         LEFT JOIN public.fantasy_seasons season ON season.id=reward.fantasy_season_id
         WHERE pack.id=$1::uuid AND pack.user_id=$2::uuid
           AND (r.league_id=$3::uuid OR season.league_id=$3::uuid) FOR UPDATE OF pack`,
        [packId, userId, leagueId]
      );
      if (packRes.rows.length === 0) return { success: false, error: "Pacote não encontrado." };
      if (packRes.rows[0].status === "claimed") return { success: false, error: "Este pacote já foi resgatado." };

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
        if (existingOffers.rows.length !== 0) throw new Error("Pacote com ofertas incompletas; é necessário corrigi-lo antes de abrir.");
        // Buscar 2 cartas do banco de dados
        const cardsRes = await client.query(
          `SELECT id, slug, name, description, rarity, (effect_config->>'requires_target_player')::boolean as requires_target
           FROM public.fantasy_cards
           WHERE enabled = true
           ORDER BY slug`
        );
        if (cardsRes.rows.length < 2) throw new Error("O catálogo não possui duas cartas disponíveis.");
        const pick = (excluded?: string) => {
          const tier = packRes.rows[0].card_tier;
          const roll = Math.random();
          const rarity = tier === "bronze" ? "COMMON" : tier === "gold" ? (roll < 0.72 ? "RARE" : "EPIC")
            : roll <= 0.55 ? "COMMON" : roll <= 0.85 ? "RARE" : roll <= 0.97 ? "EPIC" : "LEGENDARY";
          const eligible = cardsRes.rows.filter((card: any) => card.slug !== excluded);
          const matching = eligible.filter((card: any) => String(card.rarity).toUpperCase() === rarity);
          const choices = matching.length ? matching : eligible;
          return choices[Math.floor(Math.random() * choices.length)];
        };
        const first = pick();
        const cardRows = [first, pick(first.slug)];

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
           VALUES ($1, 1, $2::uuid), ($1, 2, $3::uuid)`,
          [packId, cardRows[0].id, cardRows[1].id]
        );
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
    }, userId);
  }

  async getPackById(leagueId: string, packId: string, userId: string): Promise<FantasyPackDTO | null> {
    return this.withClient(async (client) => {
      const res = await client.query(
        `SELECT p.id, p.user_id, p.status, p.created_at,
                COALESCE(r.league_id, fs.league_id) as league_id
         FROM public.fantasy_round_packs p
         LEFT JOIN public.rounds r ON r.id = p.round_id
         LEFT JOIN public.fantasy_season_pass_rewards fspr ON fspr.id = p.fantasy_season_pass_reward_id
         LEFT JOIN public.fantasy_seasons fs ON fs.id = fspr.fantasy_season_id
         WHERE p.id = $2 AND p.user_id=$3::uuid AND (r.league_id=$1::uuid OR fs.league_id=$1::uuid) LIMIT 1`,
        [leagueId, packId, userId]
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
    }, userId);
  }

  async claimPackCard(
    leagueId: string,
    userId: string,
    packId: string,
    chosenSlug: string
  ): Promise<{ success: boolean; error?: string; chosenCard?: FantasyCardDefinition }> {
    return this.withClient(async (client) => {
      const cardRes = await client.query(
        `SELECT card.id, card.slug, card.name, card.description, card.rarity, (card.effect_config->>'requires_target_player')::boolean AS requires_target
         FROM public.fantasy_round_packs pack
         JOIN public.fantasy_pack_offers offer ON offer.pack_id=pack.id
         JOIN public.fantasy_cards card ON card.id=offer.card_id
         LEFT JOIN public.rounds round_item ON round_item.id=pack.round_id
         LEFT JOIN public.fantasy_season_pass_rewards reward ON reward.id=pack.fantasy_season_pass_reward_id
         LEFT JOIN public.fantasy_seasons season ON season.id=reward.fantasy_season_id
         WHERE pack.id=$1::uuid AND pack.user_id=$2::uuid AND pack.status='opened'
           AND (round_item.league_id=$3::uuid OR season.league_id=$3::uuid) AND card.slug=$4
         FOR UPDATE OF pack`,
        [packId, userId, leagueId, chosenSlug]
      );

      const cardRow = cardRes.rows[0];
      if (!cardRow) return { success: false, error: "Pacote ou oferta indisponível nesta pelada." };
      const cardId = cardRow.id;

      await client.query(
        `UPDATE public.fantasy_round_packs
         SET status = 'claimed', chosen_card_id = $1::uuid
         WHERE id = $2`,
        [cardId, packId]
      );

      await client.query(
          `INSERT INTO public.fantasy_user_cards (league_id, user_id, card_id, source_pack_id, status, acquired_at)
           VALUES ($1, $2, $3, $4, 'OWNED', NOW())`,
          [leagueId, userId, cardId, packId]
      );

      const cardDef: FantasyCardDefinition = {
            slug: cardRow.slug,
            name: cardRow.name,
            description: cardRow.description,
            rarity: mapCardRarity(cardRow.rarity),
            cost: 0,
            requiresTargetPlayer: Boolean(cardRow.requires_target),
          };

      return { success: true, chosenCard: cardDef };
    }, userId);
  }

  async getMyInventory(leagueId: string, userId: string): Promise<{
    cards: FantasyUserCardDTO[];
    groupedBySlug: Record<string, { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }>;
  }> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT uc.id, uc.card_id, uc.status, uc.acquired_at, uc.consumed_at,
                fc.slug, fc.name, fc.description, fc.rarity, fc.effect_type, fc.effect_config,
                (fc.effect_config->>'requires_target_player')::boolean as requires_target
         FROM public.fantasy_user_cards uc
         JOIN public.fantasy_cards fc ON fc.id = uc.card_id
         WHERE uc.league_id = $1 AND uc.user_id = $2
         ORDER BY uc.acquired_at DESC`,
        [leagueId, userId]
      );

      const cards: FantasyUserCardDTO[] = rows.map((r: any) => ({
          id: r.id,
          cardId: r.card_id,
          slug: r.slug,
          name: r.name,
          description: r.description || "",
          rarity: r.rarity,
          effectType: r.effect_type,
          effectConfig: r.effect_config || {},
          status: r.status,
          acquiredAt: r.acquired_at ? new Date(r.acquired_at).toISOString() : new Date().toISOString(),
          consumedAt: r.consumed_at ? new Date(r.consumed_at).toISOString() : null,
          icon: "🃏",
        }));

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
        if (row.status === "OWNED") groupedBySlug[row.slug]!.count += 1;
        groupedBySlug[row.slug]!.instances.push(cardDto);
      }

      return { cards, groupedBySlug, availableCount: cards.filter((card) => card.status === "OWNED").length };
    }, userId);
  }

  async getMyInventoryCount(leagueId: string, userId: string): Promise<number> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int as count FROM public.fantasy_user_cards
         WHERE league_id = $1 AND user_id = $2 AND status = 'OWNED'`,
        [leagueId, userId]
      );
      return rows[0]?.count ?? 0;
    }, userId);
  }

  async getActiveCardForRound(leagueId: string, userId: string, roundId: string): Promise<FantasyActiveCardDTO | null> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT fca.id, fca.user_id, fca.round_id, fca.user_card_id, fca.status,
                fca.target_snapshot, fca.reserved_at, fca.result_bonus, fca.result_details,
                fc.slug as card_slug
         FROM public.fantasy_card_activations fca
         JOIN public.fantasy_cards fc ON fc.id = fca.card_id
         JOIN public.rounds r ON r.id=fca.round_id AND r.league_id=$3::uuid
         WHERE fca.round_id = $1 AND fca.user_id = $2
         LIMIT 1`,
        [roundId, userId, leagueId]
      );
      if (rows.length === 0) return null;
      const r = rows[0];
      const snapshot = r.target_snapshot || {};
      const targetIds = [snapshot.targetPlayerId, snapshot.targetPlayer2Id].filter(Boolean);
      const names = targetIds.length ? await client.query("SELECT id, name FROM public.players WHERE id=ANY($1::uuid[])", [targetIds]) : { rows: [] };
      const nameById = new Map(names.rows.map((row: any) => [row.id, row.name]));
      return {
        id: r.id,
        userId: r.user_id,
        roundId: r.round_id,
        cardSlug: r.card_slug,
        userCardId: r.user_card_id,
        status: r.status,
        targetPlayerId: snapshot.targetPlayerId || null,
        targetPlayer2Id: snapshot.targetPlayer2Id || null,
        targetPlayerName: snapshot.targetPlayerName || nameById.get(snapshot.targetPlayerId) || null,
        targetPlayer2Name: snapshot.targetPlayer2Name || nameById.get(snapshot.targetPlayer2Id) || null,
        targetPrediction: snapshot.targetPrediction || null,
        resultBonus: r.result_bonus == null ? null : Number(r.result_bonus),
        resultDetails: r.result_details,
        appliedAt: r.reserved_at ? new Date(r.reserved_at).toISOString() : new Date().toISOString(),
      };
    }, userId);
  }

  async getCardDefinition(cardSlug: string): Promise<FantasyCardDefinition | null> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT slug, name, description, rarity, (effect_config->>'requires_target_player')::boolean as requires_target
         FROM public.fantasy_cards
         WHERE slug = $1 LIMIT 1`,
        [cardSlug]
      );
      if (rows.length === 0) return null;
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
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [`${params.roundId}:${params.userId}`]);
      const round = await client.query(
        `SELECT r.id, fr.fantasy_season_id FROM public.rounds r
         LEFT JOIN public.fantasy_rounds fr ON fr.round_id=r.id
         WHERE r.id=$1::uuid AND r.league_id=$2::uuid AND r.status='draft'
           AND public.is_league_member(r.league_id)
           AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.round_id=r.id AND (m.started_at IS NOT NULL OR m.status IN ('in_progress','live')))
         FOR UPDATE OF r`, [params.roundId, params.leagueId],
      );
      if (!round.rowCount) return { success: false, error: "O mercado já está fechado para esta rodada." };
      const cardRes = await client.query(
        `SELECT uc.card_id, uc.status, fc.slug, fc.name, fc.rarity, fc.effect_type, fc.effect_config
         FROM public.fantasy_user_cards uc
         JOIN public.fantasy_cards fc ON fc.id = uc.card_id
         WHERE uc.id = $1 AND uc.user_id = $2 AND uc.league_id=$3::uuid FOR UPDATE OF uc`,
        [params.userCardId, params.userId, params.leagueId]
      );
      if (cardRes.rows.length === 0) {
        return { success: false, error: "Carta não encontrada no seu inventário." };
      }

      const card = cardRes.rows[0];
      const current = await client.query("SELECT id,user_card_id,status FROM public.fantasy_card_activations WHERE round_id=$1::uuid AND user_id=$2::uuid FOR UPDATE", [params.roundId, params.userId]);
      const old = current.rows[0];
      if (old && old.status !== "RESERVED") return { success: false, error: "O mercado já está fechado para esta rodada." };
      if (card.status !== "OWNED" && !(card.status === "RESERVED" && old?.user_card_id === params.userCardId)) {
        return { success: false, error: "Esta carta não está disponível para uso." };
      }
      const lineupSingle = new Set(["vice_captain", "golden_goal", "golden_assist", "scout", "so_vim_pela_resenha", "samu_do_cartola", "tava_em_campo", "my_mvp", "head_to_head", "bagre_insurance", "bagre_value_shield", "triple_crown", "bagre_or_craque", "emergency_sub"]);
      const noTarget = new Set(["super_captain", "extra_credit", "dream_team", "safe_prediction"]);
      if (!lineupSingle.has(card.slug) && !noTarget.has(card.slug) && !["duo", "double_prediction", "bargain", "all_in"].includes(card.slug)) {
        return { success: false, error: "Carta não reconhecida pelo catálogo atual." };
      }
      if (params.targetPrediction && !["TOP_SCORER", "TOP_ASSIST", "CHALLENGE"].includes(params.targetPrediction)) {
        return { success: false, error: "Palpite inválido." };
      }
      const needsLineup = lineupSingle.has(card.slug) || card.slug === "duo";
      const lineup = needsLineup ? await client.query(
        `SELECT l.captain_player_id, lp.player_id, lp.price_locked FROM public.fantasy_rounds fr
         JOIN public.fantasy_lineups l ON l.fantasy_round_id=fr.id AND l.user_id=$2::uuid
         JOIN public.fantasy_lineup_players lp ON lp.lineup_id=l.id WHERE fr.round_id=$1::uuid`,
        [params.roundId, params.userId],
      ) : { rows: [] };
      const lineupIds = new Set(lineup.rows.map((row: any) => row.player_id));
      if (needsLineup && !lineup.rows.length) return { success: false, error: "Salve sua escalação antes de ativar esta carta." };
      if (lineupSingle.has(card.slug) && (!params.targetPlayerId || !lineupIds.has(params.targetPlayerId))) {
        return { success: false, error: "Esse atleta não está na escalação salva." };
      }
      if (card.slug === "vice_captain" && params.targetPlayerId === lineup.rows[0]?.captain_player_id) {
        return { success: false, error: "O Vice-Capitão deve ser diferente do Capitão oficial." };
      }
      if (card.slug === "duo" && (!params.targetPlayerId || !params.targetPlayer2Id || params.targetPlayerId === params.targetPlayer2Id || !lineupIds.has(params.targetPlayerId) || !lineupIds.has(params.targetPlayer2Id))) {
        return { success: false, error: "Selecione dois jogadores diferentes da escalação." };
      }
      if (["bargain", "all_in", "double_prediction", "scout"].includes(card.slug)) {
        const prices = await client.query("SELECT player_id,current_price FROM public.fantasy_player_prices WHERE fantasy_season_id=$1::uuid", [round.rows[0].fantasy_season_id]);
        const marketIds = new Set(prices.rows.map((row: any) => row.player_id));
        if ((card.slug === "all_in" || card.slug === "double_prediction") && (!params.targetPlayerId || !marketIds.has(params.targetPlayerId))) return { success: false, error: "Escolha um atleta válido do mercado." };
        if (card.slug === "bargain" && params.targetPlayerId && !marketIds.has(params.targetPlayerId)) return { success: false, error: "Escolha um atleta válido do mercado." };
        if (card.slug === "double_prediction" && (!params.targetPlayer2Id || params.targetPlayerId === params.targetPlayer2Id || !marketIds.has(params.targetPlayer2Id))) return { success: false, error: "Escolha dois jogadores diferentes do mercado." };
        if (card.slug === "scout") {
          const sorted = prices.rows.map((row: any) => Number(row.current_price)).filter(Number.isFinite).sort((a: number, b: number) => a - b);
          const target = lineup.rows.find((row: any) => row.player_id === params.targetPlayerId);
          const targetPrice = Number(target?.price_locked ?? prices.rows.find((row: any) => row.player_id === params.targetPlayerId)?.current_price ?? 0);
          const mid = Math.floor(sorted.length / 2);
          const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
          if (!sorted.length || !(sorted[0] === sorted[sorted.length - 1] ? targetPrice === median : targetPrice < median)) return { success: false, error: "Esse atleta não está abaixo da mediana de preço." };
        }
      }
      const cardId = card.card_id;
      const effect = { cardRulesVersion: 2, slug: card.slug, name: card.name, rarity: card.rarity, effectType: card.effect_type, effectConfig: card.effect_config || {} };
      const snapshot = {
        targetPlayerId: params.targetPlayerId || null,
        targetPlayer2Id: card.slug === "head_to_head" ? null : params.targetPlayer2Id || null,
        targetPrediction: params.targetPrediction || null,
      };

      const reserved = await client.query("UPDATE public.fantasy_user_cards SET status='RESERVED' WHERE id=$1::uuid AND user_id=$2::uuid AND league_id=$3::uuid", [params.userCardId, params.userId, params.leagueId]);
      if (!reserved.rowCount) throw new Error("Não foi possível reservar esta carta.");
      await client.query(
        `INSERT INTO public.fantasy_card_activations (round_id, user_id, user_card_id, card_id, target_snapshot, effect_snapshot, status, reserved_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'RESERVED', NOW())
         ON CONFLICT (round_id, user_id)
         DO UPDATE SET user_card_id = EXCLUDED.user_card_id,
                       card_id = EXCLUDED.card_id,
                       target_snapshot = EXCLUDED.target_snapshot,
                       effect_snapshot = EXCLUDED.effect_snapshot,
                       status = 'RESERVED',
                       reserved_at = NOW()`,
        [
          params.roundId,
          params.userId,
          params.userCardId,
          cardId,
          JSON.stringify(snapshot),
          JSON.stringify(effect),
        ]
      );

      if (old?.user_card_id && old.user_card_id !== params.userCardId) {
        const restored = await client.query("UPDATE public.fantasy_user_cards SET status='OWNED' WHERE id=$1::uuid AND user_id=$2::uuid AND league_id=$3::uuid AND status='RESERVED'", [old.user_card_id, params.userId, params.leagueId]);
        if (!restored.rowCount) throw new Error("Não foi possível devolver a carta anterior ao inventário.");
      }

      return { success: true };
    }, params.userId);
  }

  async removeActiveCardForRound(leagueId: string, userId: string, roundId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      const round = await client.query(`SELECT 1 FROM public.rounds r WHERE r.id=$1::uuid AND r.league_id=$2::uuid
        AND r.status='draft' AND public.is_league_member(r.league_id)
        AND NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.round_id=r.id AND (m.started_at IS NOT NULL OR m.status IN ('in_progress','live')))
        FOR UPDATE OF r`, [roundId, leagueId]);
      if (!round.rowCount) return { success: false, error: "Não é possível remover a carta após o fechamento do mercado ou em outra pelada." };
      const actRes = await client.query(
        `SELECT id, user_card_id, status FROM public.fantasy_card_activations WHERE round_id = $1 AND user_id = $2 FOR UPDATE`,
        [roundId, userId]
      );
      if (actRes.rows.length > 0) {
        const activation = actRes.rows[0];
        if (activation.status !== "RESERVED") return { success: false, error: "Não é possível remover a carta após o fechamento do mercado." };
        const restored = await client.query(
          "UPDATE public.fantasy_user_cards SET status='OWNED' WHERE id=$1::uuid AND league_id=$2::uuid AND user_id=$3::uuid AND status='RESERVED'",
          [activation.user_card_id, leagueId, userId],
        );
        if (!restored.rowCount) throw new Error("Não foi possível devolver a carta ao inventário.");
        await client.query("DELETE FROM public.fantasy_card_activations WHERE id=$1::uuid", [activation.id]);
      }
      return { success: true };
    }, userId);
  }

  async generatePacksForFinishedRound(leagueId: string, roundId: string, userId: string): Promise<number> {
    return this.withClient(async (client) => {
      const scoped = await client.query("SELECT 1 FROM public.rounds WHERE id=$1::uuid AND league_id=$2::uuid AND status='finished' AND public.is_league_admin(league_id)", [roundId, leagueId]);
      if (!scoped.rowCount) return 0;
      const result = await client.query("SELECT public.ensure_fantasy_round_reward_packs($1::uuid) AS count", [roundId]);
      return Number(result.rows[0]?.count || 0);
    }, userId);
  }

  async giveMyAccountTestPack(leagueId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      const rRes = await client.query(
        `SELECT id FROM public.rounds WHERE league_id = $1 AND public.is_league_admin(league_id) ORDER BY created_at DESC LIMIT 1`,
        [leagueId]
      );
      const roundId = rRes.rows[0]?.id;
      if (!roundId) return { success: false, error: "Nenhuma rodada encontrada para associar o pacote." };
      await client.query("DELETE FROM public.fantasy_round_packs WHERE round_id=$1::uuid AND user_id=$2::uuid AND source='test'", [roundId, userId]);

      await client.query(
        `INSERT INTO public.fantasy_round_packs (round_id, user_id, status, source, granted_by)
         VALUES ($1, $2, 'available', 'test', $2)`,
        [roundId, userId]
      );
      return { success: true };
    }, userId);
  }

  async resetMyAccountCards(leagueId: string, userId: string): Promise<{
    success: boolean;
    deletedCardsCount?: number;
    deletedActivationsCount?: number;
    deletedPacksCount?: number;
    error?: string;
  }> {
    return { success: false, error: "A limpeza de cartas ainda não está disponível nesta API." };
  }

  async distributePackToAllLineupUsers(leagueId: string, userId: string): Promise<{
    success: boolean;
    awardedUsersCount?: number;
    roundNumber?: number;
    error?: string;
  }> {
    return this.withClient(async (client) => {
      const rRes = await client.query(
        `SELECT id, number FROM public.rounds WHERE league_id = $1 AND public.is_league_admin(league_id) ORDER BY (status IN ('draft','active')) DESC, created_at DESC LIMIT 1 FOR UPDATE`,
        [leagueId]
      );
      const round = rRes.rows[0];
      if (!round) return { success: false, error: "Nenhuma rodada encontrada." };

      const lineups = await client.query("SELECT DISTINCT l.user_id FROM public.fantasy_lineups l JOIN public.fantasy_rounds fr ON fr.id=l.fantasy_round_id JOIN public.league_members m ON m.user_id=l.user_id AND m.league_id=$2::uuid AND m.is_active WHERE fr.round_id=$1::uuid", [round.id, leagueId]);
      const users = lineups.rows.map((row: { user_id: string }) => row.user_id);
      if (!users.length) return { success: false, error: "Nenhum usuário com escalação registrada foi encontrado." };
      await client.query("DELETE FROM public.fantasy_round_packs WHERE round_id=$1::uuid AND user_id=ANY($2::uuid[]) AND source='admin_bulk'", [round.id, users]);
      const inserted = await client.query("INSERT INTO public.fantasy_round_packs (round_id,user_id,status,source,granted_by) SELECT $1::uuid, unnest($2::uuid[]), 'available', 'admin_bulk', $3::uuid", [round.id, users, userId]);
      return {
        success: true,
        awardedUsersCount: inserted.rowCount ?? 0,
        roundNumber: Number(round.number),
      };
    }, userId);
  }

  async auditAndRepairCurrentSeasonPacks(leagueId: string, userId: string): Promise<{ success: boolean; rounds?: unknown[]; error?: string }> {
    return this.withClient(async (client) => {
      const allowed = await client.query("SELECT public.is_league_admin($1::uuid) AS allowed", [leagueId]);
      if (!allowed.rows[0]?.allowed) return { success: false, error: "Somente administradores podem auditar pacotes." };
      const rounds = await client.query(`SELECT fr.id, fr.round_id, r.number FROM public.fantasy_rounds fr
        JOIN public.fantasy_seasons fs ON fs.id=fr.fantasy_season_id
        JOIN public.seasons s ON s.id=fs.season_id AND s.status='active'
        JOIN public.rounds r ON r.id=fr.round_id AND r.league_id=fs.league_id
        WHERE fs.league_id=$1::uuid AND fr.market_status='finished' ORDER BY r.date,r.number`, [leagueId]);
      const report = [];
      for (const round of rounds.rows) {
        const eligible = await client.query(`SELECT DISTINCT l.user_id, COALESCE(p.name, l.user_id::text) AS name
          FROM public.fantasy_lineups l
          JOIN public.league_members m ON m.user_id=l.user_id AND m.league_id=$2::uuid AND m.is_active
          LEFT JOIN public.account_profiles ap ON ap.user_id=l.user_id LEFT JOIN public.players p ON p.id=ap.player_id
          WHERE l.fantasy_round_id=$1::uuid AND l.status IN ('scored','missed') AND l.saved_at IS NOT NULL`, [round.id, leagueId]);
        const packs = await client.query("SELECT DISTINCT user_id FROM public.fantasy_round_packs WHERE round_id=$1::uuid AND source='round_reward'", [round.round_id]);
        const received = new Set(packs.rows.map((row: { user_id: string }) => row.user_id));
        const missing = eligible.rows.filter((row: { user_id: string }) => !received.has(row.user_id));
        const repair = missing.length ? await client.query("SELECT public.ensure_fantasy_round_reward_packs($1::uuid) AS count", [round.round_id]) : { rows: [] };
        report.push({ roundId: round.round_id, roundNumber: Number(round.number), eligible: eligible.rows.length,
          received: received.size, missing: missing.map((row: { name: string }) => row.name), repaired: Number(repair.rows[0]?.count || 0) });
      }
      return { success: true, rounds: report };
    }, userId);
  }

  async grantFantasyPackToUser(leagueId: string, targetUserId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    return this.withClient(async (client) => {
      const rRes = await client.query(
        `SELECT id FROM public.rounds WHERE league_id = $1 AND public.is_league_admin(league_id) ORDER BY created_at DESC LIMIT 1`,
        [leagueId]
      );
      const roundId = rRes.rows[0]?.id;
      if (!roundId) return { success: false, error: "Nenhuma rodada encontrada para associar o pacote." };
      const member = await client.query("SELECT 1 FROM public.league_members WHERE league_id=$1::uuid AND user_id=$2::uuid AND is_active", [leagueId, targetUserId]);
      if (!member.rowCount) return { success: false, error: "Usuário não pertence a esta pelada." };

      await client.query(
        `INSERT INTO public.fantasy_round_packs (round_id, user_id, status, source, granted_by)
         VALUES ($1, $2, 'available', 'admin_gift', $3)`,
        [roundId, targetUserId, userId]
      );
      return { success: true };
    }, userId);
  }
}
