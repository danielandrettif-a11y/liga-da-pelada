import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { CardsRepository } from "../application/manage-cards.js";
import {
  cardTargetRequirement,
  type FantasyActiveCardDTO,
  type FantasyCardDefinition,
  type FantasyPackDTO,
  type FantasyUserCardDTO,
} from "../domain/cards.js";

function mapCard(row: any): FantasyCardDefinition {
  const icons: Record<string, string> = {
    super_captain: "👑", extra_credit: "💰", double_prediction: "🎯", bargain: "🤑",
    vice_captain: "🛡️", golden_goal: "⚽", golden_assist: "🍽️", scout: "💎", duo: "⚡",
    all_in: "🎰", so_vim_pela_resenha: "🪑", samu_do_cartola: "🩺", tava_em_campo: "👻",
    my_mvp: "🌟", head_to_head: "⚔️", bagre_insurance: "🛟", bagre_value_shield: "💎",
    triple_crown: "🏆", bagre_or_craque: "🎭", dream_team: "👑", safe_prediction: "🔮",
  };
  return {
    id: row.id,
    slug: row.slug,
    name: row.name || "Carta",
    description: row.description || "",
    rarity: row.rarity,
    effectType: row.effect_type || "NONE",
    effectConfig: row.effect_config || {},
    enabled: row.enabled !== false,
    icon: icons[row.slug] || "🃏",
    requiresTarget: cardTargetRequirement(row.slug),
  };
}

const PACK_SCOPE = `
  LEFT JOIN public.rounds pack_round ON pack_round.id = pack.round_id
  LEFT JOIN public.fantasy_season_pass_rewards reward ON reward.id = pack.fantasy_season_pass_reward_id
  LEFT JOIN public.fantasy_seasons pass_season ON pass_season.id = reward.fantasy_season_id`;

export class PgCardsRepository implements CardsRepository {
  constructor(private readonly pool: Pool) {}

  private withUser<T>(userId: string, callback: (client: PoolClient) => Promise<T>): Promise<T> {
    return withAuthenticatedTransaction(this.pool, { userId }, callback);
  }

  async isLeagueAdmin(leagueId: string, userId: string): Promise<boolean> {
    return this.withUser(userId, async (client) => {
      const result = await client.query("SELECT public.is_league_admin($1::uuid) allowed", [leagueId]);
      return Boolean(result.rows[0]?.allowed);
    });
  }

  private async readPack(client: PoolClient, leagueId: string, userId: string, packId: string, lock = false): Promise<FantasyPackDTO | null> {
    if (lock) {
      const locked = await client.query(
        `SELECT pack.id FROM public.fantasy_round_packs pack ${PACK_SCOPE}
         WHERE pack.id=$1::uuid AND pack.user_id=$2::uuid
           AND COALESCE(pack_round.league_id,pass_season.league_id)=$3::uuid FOR UPDATE OF pack`,
        [packId, userId, leagueId],
      );
      if (!locked.rowCount) return null;
    }
    const result = await client.query<any>(
      `SELECT pack.id, pack.round_id, pack.status, pack.opened_at, pack.chosen_card_id,
              pack.created_at, pack.source, pack.card_tier, pack_round.number round_number,
              COALESCE(jsonb_agg(jsonb_build_object('slot', offer.slot, 'card',
                jsonb_build_object('id', card.id, 'slug', card.slug, 'name', card.name,
                  'description', card.description, 'rarity', card.rarity, 'effect_type', card.effect_type,
                  'effect_config', card.effect_config, 'enabled', card.enabled)) ORDER BY offer.slot)
                FILTER (WHERE offer.id IS NOT NULL), '[]'::jsonb) offers
       FROM public.fantasy_round_packs pack ${PACK_SCOPE}
       LEFT JOIN public.fantasy_pack_offers offer ON offer.pack_id = pack.id
       LEFT JOIN public.fantasy_cards card ON card.id = offer.card_id
       WHERE pack.id = $1::uuid AND pack.user_id = $2::uuid
         AND COALESCE(pack_round.league_id, pass_season.league_id) = $3::uuid
       GROUP BY pack.id, pack_round.number`,
      [packId, userId, leagueId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      roundId: row.round_id,
      roundNumber: row.round_number == null ? undefined : Number(row.round_number),
      source: row.source,
      cardTier: row.card_tier,
      status: row.status,
      openedAt: row.opened_at,
      chosenCardId: row.chosen_card_id,
      createdAt: row.created_at,
      offers: (row.offers || []).map((offer: any) => ({ slot: Number(offer.slot), card: mapCard(offer.card) })),
    };
  }

  async getMyPacks(leagueId: string, userId: string) {
    return this.withUser(userId, async (client) => {
      const ids = await client.query<{ id: string }>(
        `SELECT pack.id FROM public.fantasy_round_packs pack ${PACK_SCOPE}
         WHERE pack.user_id = $1::uuid AND COALESCE(pack_round.league_id, pass_season.league_id) = $2::uuid
         ORDER BY pack.created_at DESC`, [userId, leagueId]);
      const packs = (await Promise.all(ids.rows.map((row) => this.readPack(client, leagueId, userId, row.id)))).filter(Boolean) as FantasyPackDTO[];
      return {
        availablePacks: packs.filter((pack) => pack.status === "available" || pack.status === "opened"),
        claimedCount: packs.filter((pack) => pack.status === "claimed").length,
        totalPacks: packs.filter((pack) => pack.status !== "dismissed").length,
      };
    });
  }

  async restoreMyPassPacks(leagueId: string, userId: string, fantasySeasonId: string) {
    return this.withUser(userId, async (client) => {
      const season = await client.query(
        "SELECT 1 FROM public.fantasy_seasons WHERE id = $1::uuid AND league_id = $2::uuid", [fantasySeasonId, leagueId]);
      if (!season.rowCount) return { success: false, error: "Passe não pertence à pelada selecionada." };
      const restored = await client.query<{ count: number }>(
        "SELECT public.restore_my_pass_card_packs($1::uuid)::integer count", [fantasySeasonId]);
      return { success: true, restored: Number(restored.rows[0]?.count || 0) };
    });
  }

  async openPack(leagueId: string, userId: string, packId: string) {
    try {
      return await this.withUser(userId, async (client) => {
        let pack = await this.readPack(client, leagueId, userId, packId, true);
        if (!pack) return { success: false, error: "Pacote não encontrado ou não pertence a você." };
        if (pack.status === "claimed") return { success: false, error: "Este pacote já foi resgatado." };
        if (pack.offers.length >= 2) return { success: true, offers: [pack.offers[0]!.card, pack.offers[1]!.card] as [FantasyCardDefinition, FantasyCardDefinition] };
        const candidates = await client.query<any>(
          `SELECT id, slug, name, description, rarity, effect_type, effect_config, enabled
           FROM public.fantasy_cards WHERE enabled = true
           ORDER BY CASE WHEN $1 = 'gold' AND rarity IN ('EPIC','LEGENDARY') THEN 0 ELSE 1 END, random() LIMIT 2`,
          [pack.cardTier || null],
        );
        if (candidates.rows.length < 2) return { success: false, error: "Catálogo de cartas incompleto." };
        for (const [index, card] of candidates.rows.entries()) {
          await client.query(
            `INSERT INTO public.fantasy_pack_offers (pack_id, slot, card_id) VALUES ($1::uuid,$2,$3::uuid)
             ON CONFLICT (pack_id, slot) DO NOTHING`, [packId, index + 1, card.id]);
        }
        await client.query(
          `UPDATE public.fantasy_round_packs SET status='opened', opened_at=COALESCE(opened_at,now())
           WHERE id=$1::uuid AND user_id=$2::uuid`, [packId, userId]);
        pack = await this.readPack(client, leagueId, userId, packId);
        if (!pack || pack.offers.length < 2) return { success: false, error: "Não foi possível persistir as ofertas do pacote." };
        return { success: true, offers: [pack.offers[0]!.card, pack.offers[1]!.card] as [FantasyCardDefinition, FantasyCardDefinition] };
      });
    } catch (error: any) { return { success: false, error: error.message }; }
  }

  getPackById(leagueId: string, userId: string, packId: string) {
    return this.withUser(userId, (client) => this.readPack(client, leagueId, userId, packId));
  }

  async claimPackCard(leagueId: string, userId: string, packId: string, chosenSlug: string) {
    try {
      return await this.withUser(userId, async (client) => {
        const pack = await this.readPack(client, leagueId, userId, packId, true);
        if (!pack) return { success: false, error: "Pacote inválido." };
        const offer = pack.offers.find((item) => item.card.slug === chosenSlug);
        if (!offer) return { success: false, error: "A carta escolhida não pertence às opções sorteadas deste pacote." };
        const existing = await client.query<any>(
          `SELECT card.id, card.slug, card.name, card.description, card.rarity, card.effect_type, card.effect_config, card.enabled
           FROM public.fantasy_user_cards owned JOIN public.fantasy_cards card ON card.id=owned.card_id
           WHERE owned.user_id=$1::uuid AND owned.source_pack_id=$2::uuid`, [userId, packId]);
        if (!existing.rows[0]) {
          await client.query(
            `INSERT INTO public.fantasy_user_cards (user_id,league_id,card_id,source_pack_id,status)
             VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'OWNED')`, [userId, leagueId, offer.card.id, packId]);
        }
        const chosen = existing.rows[0] ? mapCard(existing.rows[0]) : offer.card;
        await client.query(
          `UPDATE public.fantasy_round_packs SET status='claimed', chosen_card_id=$1::uuid
           WHERE id=$2::uuid AND user_id=$3::uuid`, [chosen.id, packId, userId]);
        return { success: true, chosenCard: chosen };
      });
    } catch (error: any) { return { success: false, error: error.message }; }
  }

  async getMyInventory(leagueId: string, userId: string) {
    return this.withUser(userId, async (client) => {
      const result = await client.query<any>(
        `SELECT owned.id, owned.card_id, owned.status, owned.acquired_at, owned.consumed_at,
                card.slug, card.name, card.description, card.rarity, card.effect_type, card.effect_config, card.enabled
         FROM public.fantasy_user_cards owned JOIN public.fantasy_cards card ON card.id=owned.card_id
         WHERE owned.league_id=$1::uuid AND owned.user_id=$2::uuid ORDER BY owned.acquired_at DESC`, [leagueId, userId]);
      const cards: FantasyUserCardDTO[] = result.rows.map((row: any) => ({
        id: row.id, cardId: row.card_id, slug: row.slug, name: row.name, description: row.description,
        rarity: row.rarity, effectType: row.effect_type, effectConfig: row.effect_config || {}, status: row.status,
        acquiredAt: row.acquired_at, consumedAt: row.consumed_at, icon: "🃏",
      }));
      const groupedBySlug: Record<string, { count: number; card: FantasyCardDefinition; instances: FantasyUserCardDTO[] }> = {};
      for (const item of cards) {
        groupedBySlug[item.slug] ||= { count: 0, card: mapCard({ ...item, id: item.cardId, effect_type: item.effectType, effect_config: item.effectConfig, enabled: true }), instances: [] };
        if (item.status === "OWNED") groupedBySlug[item.slug]!.count += 1;
        groupedBySlug[item.slug]!.instances.push(item);
      }
      return { cards, groupedBySlug };
    });
  }

  async getMyInventoryCount(leagueId: string, userId: string): Promise<number> {
    return this.withUser(userId, async (client) => {
      const result = await client.query<{ count: number }>(
        "SELECT count(*)::integer count FROM public.fantasy_user_cards WHERE league_id=$1::uuid AND user_id=$2::uuid AND status='OWNED'",
        [leagueId, userId]);
      return Number(result.rows[0]?.count || 0);
    });
  }

  async getActiveCardForRound(leagueId: string, userId: string, roundId: string): Promise<FantasyActiveCardDTO | null> {
    return this.withUser(userId, async (client) => {
      const result = await client.query<any>(
        `SELECT activation.*, card.slug, card.name, card.description, card.rarity, card.effect_type, card.effect_config, card.enabled,
                target_one.name target_one_name, target_two.name target_two_name
         FROM public.fantasy_card_activations activation
         JOIN public.rounds round_item ON round_item.id=activation.round_id AND round_item.league_id=$1::uuid
         JOIN public.fantasy_cards card ON card.id=activation.card_id
         LEFT JOIN public.players target_one ON target_one.id=(activation.target_snapshot->>'targetPlayerId')::uuid
         LEFT JOIN public.players target_two ON target_two.id=(activation.target_snapshot->>'targetPlayer2Id')::uuid
         WHERE activation.round_id=$2::uuid AND activation.user_id=$3::uuid`, [leagueId, roundId, userId]);
      const row = result.rows[0];
      if (!row) return null;
      const target = row.target_snapshot || {};
      return { id: row.id, roundId: row.round_id, userCardId: row.user_card_id, card: mapCard(row), status: row.status,
        targetPlayerId: target.targetPlayerId || null, targetPlayerName: row.target_one_name || null,
        targetPlayer2Id: target.targetPlayer2Id || null, targetPlayer2Name: row.target_two_name || null,
        targetPrediction: target.targetPrediction || null, resultBonus: Number(row.result_bonus || 0), resultDetails: row.result_details };
    });
  }

  async getOwnedCardDefinition(leagueId: string, userId: string, roundId: string, userCardId: string) {
    return this.withUser(userId, async (client) => {
      const result = await client.query<any>(
        `SELECT card.id,card.slug,card.name,card.description,card.rarity,card.effect_type,card.effect_config,card.enabled
         FROM public.fantasy_user_cards owned JOIN public.fantasy_cards card ON card.id=owned.card_id
         WHERE owned.id=$1::uuid AND owned.user_id=$2::uuid AND owned.league_id=$3::uuid
           AND (owned.status='OWNED' OR (owned.status='RESERVED' AND EXISTS (
             SELECT 1 FROM public.fantasy_card_activations activation
             WHERE activation.user_card_id=owned.id AND activation.round_id=$4::uuid AND activation.status='RESERVED')))`,
        [userCardId, userId, leagueId, roundId]);
      return result.rows[0] ? mapCard(result.rows[0]) : null;
    });
  }

  async isRoundOpen(leagueId: string, _userId: string, roundId: string) {
    return this.withUser(_userId, async (client) => {
      const result = await client.query(
        `SELECT 1 FROM public.rounds round_item WHERE round_item.id=$1::uuid AND round_item.league_id=$2::uuid
           AND round_item.status='draft' AND NOT EXISTS (SELECT 1 FROM public.matches match_item
             WHERE match_item.round_id=round_item.id AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live','in_progress','finished')))`,
        [roundId, leagueId]);
      return Boolean(result.rowCount);
    });
  }

  async activateCardForRound(params: { leagueId: string; userId: string; roundId: string; userCardId: string;
    targetPlayerId?: string | null; targetPlayer2Id?: string | null; targetPrediction?: string | null }) {
    try {
      return await this.withUser(params.userId, async (client) => {
        const openRound = await client.query(
          `SELECT 1 FROM public.rounds round_item WHERE round_item.id=$1::uuid AND round_item.league_id=$2::uuid
             AND round_item.status='draft' AND NOT EXISTS (SELECT 1 FROM public.matches match_item
               WHERE match_item.round_id=round_item.id AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live','in_progress','finished')))
           FOR UPDATE OF round_item`, [params.roundId, params.leagueId]);
        if (!openRound.rowCount) return { success: false, error: "O mercado já está fechado para esta rodada." };
        const owned = await client.query<any>(
          `SELECT owned.id,owned.card_id,owned.status,card.slug,card.name,card.rarity,card.effect_type,card.effect_config
           FROM public.fantasy_user_cards owned JOIN public.fantasy_cards card ON card.id=owned.card_id
           WHERE owned.id=$1::uuid AND owned.user_id=$2::uuid AND owned.league_id=$3::uuid FOR UPDATE OF owned`,
          [params.userCardId, params.userId, params.leagueId]);
        if (!owned.rows[0]) return { success: false, error: "Carta não encontrada no seu inventário." };
        const current = await client.query<any>(
          "SELECT id,user_card_id,status FROM public.fantasy_card_activations WHERE round_id=$1::uuid AND user_id=$2::uuid FOR UPDATE",
          [params.roundId, params.userId]);
        if (current.rows[0] && current.rows[0].status !== "RESERVED") {
          return { success: false, error: "Não é possível trocar a carta após o fechamento do mercado." };
        }
        if (owned.rows[0].status !== "OWNED" && current.rows[0]?.user_card_id !== params.userCardId) {
          return { success: false, error: "Esta carta não está disponível para uso." };
        }
        const targets = [params.targetPlayerId, params.targetPlayer2Id].filter(Boolean);
        if (targets.length) {
          const validTargets = await client.query<{ id: string }>(
            `SELECT member.player_id id FROM public.league_members member
             WHERE member.league_id=$1::uuid AND member.is_active AND member.player_id=ANY($2::uuid[])`,
            [params.leagueId, targets]);
          if (validTargets.rowCount !== new Set(targets).size) return { success: false, error: "Escolha atletas válidos desta pelada." };
          const marketTarget = ["double_prediction", "all_in"].includes(owned.rows[0].slug);
          const eligibleTargets = marketTarget
            ? await client.query<{ id: string }>(
                `SELECT price.player_id id FROM public.fantasy_player_prices price
                 JOIN public.fantasy_rounds fantasy_round ON fantasy_round.fantasy_season_id=price.fantasy_season_id
                 WHERE fantasy_round.round_id=$1::uuid AND price.player_id=ANY($2::uuid[])`,
                [params.roundId, targets])
            : await client.query<{ id: string }>(
                `SELECT item.player_id id FROM public.fantasy_lineup_players item
                 JOIN public.fantasy_lineups lineup ON lineup.id=item.lineup_id
                 JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
                 WHERE fantasy_round.round_id=$1::uuid AND lineup.user_id=$2::uuid AND item.player_id=ANY($3::uuid[])`,
                [params.roundId, params.userId, targets]);
          if (eligibleTargets.rowCount !== new Set(targets).size) {
            return { success: false, error: marketTarget
              ? "Escolha atletas válidos do mercado para esta carta."
              : "Esse atleta não está na escalação salva." };
          }
          if (owned.rows[0].slug === "scout") {
            const priceCheck = await client.query<any>(
              `SELECT max(price.current_price) FILTER (WHERE price.player_id=$2::uuid) target_price,
                      min(price.current_price) market_min, max(price.current_price) market_max,
                      percentile_cont(0.5) WITHIN GROUP (ORDER BY price.current_price) market_median
               FROM public.fantasy_player_prices price
               JOIN public.fantasy_rounds fantasy_round ON fantasy_round.fantasy_season_id=price.fantasy_season_id
               WHERE fantasy_round.round_id=$1::uuid`, [params.roundId, params.targetPlayerId]);
            const prices = priceCheck.rows[0];
            const eligible = prices?.target_price != null && prices?.market_median != null
              && (Number(prices.market_min) === Number(prices.market_max)
                || Number(prices.target_price) < Number(prices.market_median));
            if (!eligible) return { success: false, error: "Esse atleta não está abaixo da mediana de preço." };
          }
          if (owned.rows[0].slug === "vice_captain") {
            const captain = await client.query(
              `SELECT 1 FROM public.fantasy_lineups lineup
               JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
               WHERE fantasy_round.round_id=$1::uuid AND lineup.user_id=$2::uuid
                 AND lineup.captain_player_id=$3::uuid`, [params.roundId, params.userId, params.targetPlayerId]);
            if (captain.rowCount) return { success: false, error: "O Vice-Capitão deve ser diferente do Capitão oficial." };
          }
        }
        const targetSnapshot = { targetPlayerId: params.targetPlayerId || null,
          targetPlayer2Id: owned.rows[0].slug === "head_to_head" ? null : params.targetPlayer2Id || null,
          targetPrediction: params.targetPrediction || null };
        const effectSnapshot = { cardRulesVersion: 2, slug: owned.rows[0].slug,
          name: owned.rows[0].name || "Carta", rarity: owned.rows[0].rarity || "COMMON",
          effectType: owned.rows[0].effect_type || "NONE", effectConfig: owned.rows[0].effect_config || {} };
        await client.query(
          `INSERT INTO public.fantasy_card_activations
             (round_id,user_id,user_card_id,card_id,effect_snapshot,target_snapshot,status,reserved_at)
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::jsonb,'RESERVED',now())
           ON CONFLICT (round_id,user_id) DO UPDATE SET user_card_id=EXCLUDED.user_card_id,
             card_id=EXCLUDED.card_id,effect_snapshot=EXCLUDED.effect_snapshot,target_snapshot=EXCLUDED.target_snapshot,
             status='RESERVED',reserved_at=now(),locked_at=NULL,resolved_at=NULL`,
          [params.roundId, params.userId, params.userCardId, owned.rows[0].card_id,
            JSON.stringify(effectSnapshot), JSON.stringify(targetSnapshot)]);
        await client.query("UPDATE public.fantasy_user_cards SET status='RESERVED' WHERE id=$1::uuid", [params.userCardId]);
        if (current.rows[0]?.user_card_id && current.rows[0].user_card_id !== params.userCardId) {
          await client.query(
            "UPDATE public.fantasy_user_cards SET status='OWNED' WHERE id=$1::uuid AND user_id=$2::uuid AND league_id=$3::uuid AND status='RESERVED'",
            [current.rows[0].user_card_id, params.userId, params.leagueId]);
        }
        return { success: true };
      });
    } catch (error: any) { return { success: false, error: error.message }; }
  }

  async removeActiveCardForRound(leagueId: string, userId: string, roundId: string) {
    try {
      return await this.withUser(userId, async (client) => {
        const result = await client.query<any>(
          `SELECT activation.id,activation.status FROM public.fantasy_card_activations activation
           JOIN public.rounds round_item ON round_item.id=activation.round_id
           WHERE activation.round_id=$1::uuid AND activation.user_id=$2::uuid AND round_item.league_id=$3::uuid FOR UPDATE OF activation`,
          [roundId, userId, leagueId]);
        if (!result.rows[0]) return { success: true };
        if (result.rows[0].status !== "RESERVED") return { success: false, error: "Não é possível remover a carta após o fechamento do mercado." };
        await client.query("DELETE FROM public.fantasy_card_activations WHERE id=$1::uuid", [result.rows[0].id]);
        return { success: true };
      });
    } catch (error: any) { return { success: false, error: error.message }; }
  }

  async generatePacksForFinishedRound(leagueId: string, roundId: string, userId: string): Promise<number> {
    return this.withUser(userId, async (client) => {
      const round = await client.query("SELECT 1 FROM public.rounds WHERE id=$1::uuid AND league_id=$2::uuid AND status='finished'", [roundId, leagueId]);
      if (!round.rowCount) return 0;
      const result = await client.query<{ count: number }>("SELECT public.ensure_fantasy_round_reward_packs($1::uuid)::integer count", [roundId]);
      return Number(result.rows[0]?.count || 0);
    });
  }

  async giveMyAccountTestPack(leagueId: string, userId: string) {
    return this.withUser(userId, async (client) => {
      const round = await client.query<{ id: string }>(
        "SELECT id FROM public.rounds WHERE league_id=$1::uuid ORDER BY created_at DESC LIMIT 1", [leagueId]);
      if (!round.rows[0]) return { success: false, error: "Nenhuma rodada encontrada no sistema para associar o pacote." };
      const old = await client.query<{ id: string }>(
        "DELETE FROM public.fantasy_round_packs WHERE user_id=$1::uuid AND round_id=$2::uuid AND source='test' RETURNING id",
        [userId, round.rows[0].id]);
      void old;
      await client.query(
        `INSERT INTO public.fantasy_round_packs (user_id,round_id,status,source,granted_by)
         VALUES ($1::uuid,$2::uuid,'available','test',$1::uuid)`, [userId, round.rows[0].id]);
      return { success: true };
    });
  }

  async resetMyAccountCards(leagueId: string, userId: string) {
    return this.withUser(userId, async (client) => {
      const activations = await client.query(
        `DELETE FROM public.fantasy_card_activations activation USING public.rounds round_item
         WHERE activation.round_id=round_item.id AND round_item.league_id=$1::uuid AND activation.user_id=$2::uuid`, [leagueId, userId]);
      const cards = await client.query("DELETE FROM public.fantasy_user_cards WHERE league_id=$1::uuid AND user_id=$2::uuid", [leagueId, userId]);
      const packs = await client.query(
        `DELETE FROM public.fantasy_round_packs pack
         WHERE pack.user_id=$2::uuid AND (
           EXISTS (SELECT 1 FROM public.rounds round_item WHERE round_item.id=pack.round_id AND round_item.league_id=$1::uuid)
           OR EXISTS (SELECT 1 FROM public.fantasy_season_pass_rewards reward
             JOIN public.fantasy_seasons season ON season.id=reward.fantasy_season_id
             WHERE reward.id=pack.fantasy_season_pass_reward_id AND season.league_id=$1::uuid))`, [leagueId, userId]);
      return { success: true, deletedCardsCount: cards.rowCount || 0,
        deletedActivationsCount: activations.rowCount || 0, deletedPacksCount: packs.rowCount || 0 };
    });
  }

  async distributePackToAllLineupUsers(leagueId: string, userId: string) {
    return this.withUser(userId, async (client) => {
      const round = await client.query<any>(
        `SELECT id,number FROM public.rounds WHERE league_id=$1::uuid
         ORDER BY CASE WHEN status IN ('draft','active') THEN 0 ELSE 1 END, created_at DESC LIMIT 1`, [leagueId]);
      if (!round.rows[0]) return { success: false, error: "Nenhuma rodada encontrada." };
      const users = await client.query<{ user_id: string }>(
        `SELECT DISTINCT lineup.user_id FROM public.fantasy_lineups lineup
         JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
         JOIN public.league_members member ON member.user_id=lineup.user_id AND member.league_id=$2::uuid AND member.is_active
         WHERE fantasy_round.round_id=$1::uuid`, [round.rows[0].id, leagueId]);
      if (!users.rowCount) return { success: false, error: "Nenhum usuário com escalação registrada foi encontrado." };
      await client.query(
        "DELETE FROM public.fantasy_round_packs WHERE round_id=$1::uuid AND source='admin_bulk' AND user_id=ANY($2::uuid[])",
        [round.rows[0].id, users.rows.map((row) => row.user_id)]);
      await client.query(
        `INSERT INTO public.fantasy_round_packs (user_id,round_id,status,source,granted_by)
         SELECT unnest($1::uuid[]),$2::uuid,'available','admin_bulk',$3::uuid`,
        [users.rows.map((row) => row.user_id), round.rows[0].id, userId]);
      return { success: true, awardedUsersCount: users.rows.length, roundNumber: Number(round.rows[0].number) };
    });
  }

  async auditAndRepairCurrentSeasonPacks(leagueId: string, userId: string) {
    return this.withUser(userId, async (client) => {
      const rounds = await client.query<{ round_id: string }>(
        `SELECT fantasy_round.round_id FROM public.fantasy_rounds fantasy_round
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=fantasy_round.fantasy_season_id
         JOIN public.seasons season ON season.id=fantasy_season.season_id AND season.status='active'
         WHERE fantasy_season.league_id=$1::uuid AND fantasy_round.market_status='finished'`, [leagueId]);
      let repaired = 0;
      for (const round of rounds.rows) {
        const result = await client.query<{ count: number }>(
          "SELECT public.ensure_fantasy_round_reward_packs($1::uuid)::integer count", [round.round_id]);
        repaired += Number(result.rows[0]?.count || 0);
      }
      return { success: true, repairedCount: repaired };
    });
  }

  async grantFantasyPackToUser(leagueId: string, targetUserId: string, userId: string) {
    return this.withUser(userId, async (client) => {
      const member = await client.query(
        "SELECT 1 FROM public.league_members WHERE league_id=$1::uuid AND user_id=$2::uuid AND is_active", [leagueId, targetUserId]);
      if (!member.rowCount) return { success: false, error: "A conta não pertence a esta pelada." };
      const round = await client.query<{ id: string }>(
        "SELECT id FROM public.rounds WHERE league_id=$1::uuid ORDER BY created_at DESC LIMIT 1", [leagueId]);
      if (!round.rows[0]) return { success: false, error: "Crie ao menos uma rodada antes de enviar pacotes." };
      await client.query(
        `INSERT INTO public.fantasy_round_packs (user_id,round_id,status,source,granted_by)
         VALUES ($1::uuid,$2::uuid,'available','admin_gift',$3::uuid)`, [targetUserId, round.rows[0].id, userId]);
      return { success: true };
    });
  }
}
