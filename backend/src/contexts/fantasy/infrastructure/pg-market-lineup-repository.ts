import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { FantasyMarketLineupRepository } from "../application/manage-market-lineup.js";
import type {
  FantasyLineupSlot,
  FantasyMarketDashboardData,
  FantasyMarketPlayerSummary,
  FantasyMarketQuickHighlights,
  FantasyPlayerPerformanceDetail,
  FantasyRoundOverview,
  FantasyUserSummary,
  UserFantasyHistoryEntry,
} from "../domain/market-lineup.js";

export class PgFantasyMarketLineupRepository implements FantasyMarketLineupRepository {
  constructor(private readonly pool: Pool) {}

  private withUser<T>(userId: string, operation: (client: PoolClient) => Promise<T>) {
    return withAuthenticatedTransaction(this.pool, { userId }, operation);
  }

  async isLeagueAdmin(leagueId: string, userId: string): Promise<boolean> {
    return this.withUser(userId, async (client) => {
      const result = await client.query(
        `SELECT 1 WHERE public.is_league_admin($1::uuid)`,
        [leagueId],
      );
      return Boolean(result.rowCount);
    });
  }

  async getDashboard(leagueId: string, userId: string): Promise<FantasyMarketDashboardData> {
    return this.withUser(userId, async (client) => {
      const league = await client.query<{ feature_tier: string }>(
        "SELECT feature_tier FROM public.leagues WHERE id = $1 AND public.is_league_member(id)", [leagueId]);
      if (league.rows[0]?.feature_tier !== "complete") return {
        authenticated: true, available: false, budget: 0, spent: 0, balance: 0,
        marketOpen: false, players: [], lineup: null, confirmedCount: 0, totalPlayersCount: 0,
      };
      const season = await client.query<any>(
        `SELECT fantasy_season.id fantasy_season_id, fantasy_season.initial_budget
         FROM public.seasons season
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.season_id = season.id
         WHERE season.league_id = $1 AND season.status = 'active'
         ORDER BY season.created_at DESC LIMIT 1`, [leagueId]);
      const fantasySeason = season.rows[0];
      if (!fantasySeason) return {
        authenticated: true, available: true, budget: 0, spent: 0, balance: 0,
        marketOpen: false, players: [], lineup: null, confirmedCount: 0, totalPlayersCount: 0,
      };
      const [roundResult, accountResult, playersResult] = await Promise.all([
        client.query<any>(
          `SELECT fantasy_round.id fantasy_round_id, fantasy_round.round_id, fantasy_round.market_status,
                  round_item.number, round_item.date, round_item.start_time
           FROM public.fantasy_rounds fantasy_round
           JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
           WHERE fantasy_round.fantasy_season_id = $1
           ORDER BY round_item.number DESC, fantasy_round.created_at DESC LIMIT 1`, [fantasySeason.fantasy_season_id]),
        client.query<any>(
          `SELECT current_budget FROM public.fantasy_accounts
           WHERE fantasy_season_id = $1 AND user_id = $2`, [fantasySeason.fantasy_season_id, userId]),
        client.query<any>(
          `SELECT player.id, player.name, player.avatar_url, COALESCE(member.player_profile, player.player_profile) profile,
                  player.is_goalkeeper, price.current_price, price.total_points, price.rounds_played,
                  history.round_points last_round_points, history.variation_rate
           FROM public.league_members member
           JOIN public.players player ON player.id = member.player_id
           LEFT JOIN public.fantasy_player_prices price ON price.player_id = player.id AND price.fantasy_season_id = $2
           LEFT JOIN LATERAL (
             SELECT round_points, variation_rate FROM public.fantasy_player_price_history item
             WHERE item.player_id = player.id AND item.fantasy_season_id = $2
             ORDER BY item.created_at DESC LIMIT 1
           ) history ON true
           WHERE member.league_id = $1 AND member.is_active = true AND member.member_category = 'player'
           ORDER BY player.name`, [leagueId, fantasySeason.fantasy_season_id]),
      ]);
      const round = roundResult.rows[0];
      let lineup: any = null;
      let spent = 0;
      let confirmedCount = 0;
      if (round) {
        const [lineupResult, countResult] = await Promise.all([
          client.query<any>(
            `SELECT lineup.id, lineup.user_id, lineup.captain_player_id, lineup.lineup_cost,
                    lineup.total_points, lineup.locked_at,
                    COALESCE(jsonb_agg(jsonb_build_object('slotRole', item.slot_role, 'playerId', item.player_id,
                      'isCaptain', item.player_id = lineup.captain_player_id) ORDER BY item.created_at)
                      FILTER (WHERE item.id IS NOT NULL), '[]'::jsonb) slots
             FROM public.fantasy_lineups lineup
             LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
             WHERE lineup.fantasy_round_id = $1 AND lineup.user_id = $2
             GROUP BY lineup.id`, [round.fantasy_round_id, userId]),
          client.query<{ count: number }>(
            "SELECT count(*)::int count FROM public.fantasy_lineups WHERE fantasy_round_id = $1", [round.fantasy_round_id]),
        ]);
        const row = lineupResult.rows[0];
        confirmedCount = Number(countResult.rows[0]?.count || 0);
        if (row) {
          spent = Number(row.lineup_cost || 0);
          lineup = { id: row.id, userId: row.user_id, roundId: round.round_id, leagueId,
            captainPlayerId: row.captain_player_id, slots: row.slots || [], totalCost: spent,
            lockedAt: row.locked_at, score: row.total_points == null ? null : Number(row.total_points) };
        }
      }
      const players: FantasyMarketPlayerSummary[] = playersResult.rows.map((row: any) => {
        const roundsPlayed = Number(row.rounds_played || 0);
        const totalPoints = Number(row.total_points || 0);
        const variation = Number(row.variation_rate || 0);
        return { id: row.id, name: row.name, avatarUrl: row.avatar_url, profile: row.profile,
          isGoalkeeper: Boolean(row.is_goalkeeper), isGoodGoalkeeper: Boolean(row.is_goalkeeper),
          price: Number(row.current_price || 0), totalPoints, roundsPlayed,
          averagePoints: roundsPlayed ? Math.round(totalPoints / roundsPlayed * 100) / 100 : 0,
          lastRoundPoints: row.last_round_points == null ? null : Number(row.last_round_points),
          status: "provavel", trend: variation > 0 ? "up" : variation < 0 ? "down" : "flat" };
      });
      const budget = Number(accountResult.rows[0]?.current_budget ?? fantasySeason.initial_budget);
      return { authenticated: true, available: true, roundId: round?.round_id || null,
        roundNumber: round?.number == null ? null : Number(round.number), marketOpen: round?.market_status === "open",
        marketClosesAt: null, budget, spent, balance: Math.round((budget - spent) * 100) / 100,
        players, lineup, confirmedCount, totalPlayersCount: players.length };
    });
  }

  async getPlayerDetail(leagueId: string, playerId: string, userId: string, fantasyRoundId?: string): Promise<FantasyPlayerPerformanceDetail | null> {
    return this.withUser(userId, async (client) => {
      const player = await client.query<any>(
        `SELECT player.id, player.name, player.avatar_url, COALESCE(member.player_profile, player.player_profile) profile,
                price.current_price
         FROM public.league_members member JOIN public.players player ON player.id = member.player_id
         JOIN public.seasons season ON season.league_id = member.league_id AND season.status = 'active'
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.season_id = season.id
         LEFT JOIN public.fantasy_player_prices price ON price.player_id = player.id AND price.fantasy_season_id = fantasy_season.id
         WHERE member.league_id = $1 AND member.player_id = $2 AND member.is_active = true`, [leagueId, playerId]);
      if (!player.rows[0]) return null;
      const history = await client.query<any>(
        `SELECT history.fantasy_round_id, round_item.id round_id, round_item.number round_number,
                history.round_points, history.price_after - history.price_before price_variation,
                history.goals, history.assists, COALESCE((history.metrics->>'clean_sheets')::int, 0) clean_sheets
         FROM public.fantasy_player_price_history history
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id = history.fantasy_season_id
         JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = history.fantasy_round_id
         JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
         WHERE fantasy_season.league_id = $1 AND history.player_id = $2
           AND ($3::uuid IS NULL OR history.fantasy_round_id = $3::uuid)
         ORDER BY round_item.number DESC LIMIT 8`, [leagueId, playerId, fantasyRoundId || null]);
      const totals = history.rows.reduce((sum: any, row: any) => ({ points: sum.points + Number(row.round_points || 0),
        goals: sum.goals + Number(row.goals || 0), assists: sum.assists + Number(row.assists || 0),
        clean: sum.clean + Number(row.clean_sheets || 0) }), { points: 0, goals: 0, assists: 0, clean: 0 });
      const average = history.rows.length ? Math.round(totals.points / history.rows.length * 100) / 100 : 0;
      const row = player.rows[0];
      return { playerId: row.id, name: row.name, avatarUrl: row.avatar_url, profile: row.profile,
        price: Number(row.current_price || 0), averagePoints: average, totalPoints: Math.round(totals.points * 100) / 100,
        matchesPlayed: history.rows.length, goals: totals.goals, assists: totals.assists, cleanSheets: totals.clean,
        formLevel: average >= 6 ? "hot" : average >= 3 ? "warm" : "cold",
        recentRounds: history.rows.map((item: any) => ({ roundId: item.round_id, roundNumber: Number(item.round_number),
          score: Number(item.round_points || 0), priceVariation: Number(item.price_variation || 0) })) };
    });
  }

  async getQuickHighlights(leagueId: string, userId: string): Promise<FantasyMarketQuickHighlights> {
    return this.withUser(userId, async (client) => {
      const result = await client.query<any>(
        `SELECT player.id, player.name, price.current_price price, price.total_points,
                price.rounds_played, COALESCE(history.variation_rate,0) variation
         FROM public.fantasy_player_prices price
         JOIN public.fantasy_seasons season ON season.id = price.fantasy_season_id
         JOIN public.players player ON player.id = price.player_id
         LEFT JOIN LATERAL (SELECT variation_rate FROM public.fantasy_player_price_history item
           WHERE item.fantasy_season_id = price.fantasy_season_id AND item.player_id = price.player_id
           ORDER BY item.created_at DESC LIMIT 1) history ON true
         WHERE season.league_id = $1`, [leagueId]);
      const rows = result.rows.map((row: any) => ({ ...row, price: Number(row.price), total: Number(row.total_points),
        average: Number(row.rounds_played) ? Number(row.total_points) / Number(row.rounds_played) : 0 }));
      const valued = [...rows].sort((a, b) => b.price - a.price)[0];
      const scorer = [...rows].sort((a, b) => b.average - a.average)[0];
      const benefit = [...rows].filter((r) => r.price > 0).sort((a, b) => b.average / b.price - a.average / a.price)[0];
      return { topValuedPlayer: valued ? { id: valued.id, name: valued.name, price: valued.price, variation: Number(valued.variation) } : null,
        topScorerPlayer: scorer ? { id: scorer.id, name: scorer.name, averagePoints: Math.round(scorer.average * 100) / 100 } : null,
        bestCostBenefitPlayer: benefit ? { id: benefit.id, name: benefit.name, scorePerCoin: Math.round(benefit.average / benefit.price * 100) / 100 } : null };
    });
  }

  async getMySummary(leagueId: string, userId: string): Promise<FantasyUserSummary | null> {
    return this.withUser(userId, async (client) => {
      const result = await client.query<any>(
        `WITH ranked AS (SELECT account.*, dense_rank() OVER (ORDER BY account.total_points DESC) season_rank
          FROM public.fantasy_accounts account JOIN public.fantasy_seasons season ON season.id = account.fantasy_season_id
          WHERE season.league_id = $1)
         SELECT ranked.*, (SELECT count(*) FROM public.fantasy_lineups lineup
           JOIN public.fantasy_rounds round_item ON round_item.id = lineup.fantasy_round_id
           WHERE round_item.fantasy_season_id = ranked.fantasy_season_id AND lineup.user_id = ranked.user_id) lineups_count
         FROM ranked WHERE user_id = $2`, [leagueId, userId]);
      const row = result.rows[0];
      return row ? { userId, totalPoints: Number(row.total_points), seasonRank: Number(row.season_rank),
        patrimony: Number(row.current_budget), lineupsCount: Number(row.lineups_count) } : null;
    });
  }

  async getMyHistory(leagueId: string, userId: string): Promise<UserFantasyHistoryEntry[]> {
    return this.withUser(userId, async (client) => this.readHistory(client, leagueId, userId));
  }

  private async readHistory(client: PoolClient, leagueId: string, userId: string): Promise<UserFantasyHistoryEntry[]> {
    const result = await client.query<any>(
      `SELECT round_item.id round_id, round_item.number, lineup.total_points, lineup.round_position,
              lineup.budget_after, captain.name captain_name
       FROM public.fantasy_lineups lineup
       JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
       JOIN public.fantasy_seasons season ON season.id = fantasy_round.fantasy_season_id
       JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
       LEFT JOIN public.players captain ON captain.id = lineup.captain_player_id
       WHERE season.league_id = $1 AND lineup.user_id = $2 ORDER BY round_item.number DESC`, [leagueId, userId]);
    return result.rows.map((row: any) => ({ roundId: row.round_id, roundNumber: Number(row.number),
      score: Number(row.total_points || 0), rankInRound: Number(row.round_position || 0),
      patrimonyAfter: Number(row.budget_after || 0), captainName: row.captain_name || null }));
  }

  async getRevealedLineups(leagueId: string, userId: string, roundId?: string) {
    return this.withUser(userId, async (client) => {
      if (!roundId) return { allowed: true, lineups: [] };
      const round = await client.query<any>(
        `SELECT fantasy_round.id, fantasy_round.market_status FROM public.fantasy_rounds fantasy_round
         JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
         WHERE round_item.id = $1 AND round_item.league_id = $2`, [roundId, leagueId]);
      if (!round.rows[0]) return { allowed: false, error: "Rodada não encontrada.", lineups: [] };
      if (round.rows[0].market_status === "open") return { allowed: false,
        error: "As escalações só podem ser visualizadas após o fechamento do mercado.", lineups: [] };
      const lineups = await client.query<any>(
        `SELECT lineup.*, COALESCE(jsonb_agg(jsonb_build_object('slotRole', item.slot_role, 'playerId', item.player_id,
          'score', item.total_points) ORDER BY item.created_at) FILTER (WHERE item.id IS NOT NULL), '[]'::jsonb) slots
         FROM public.fantasy_lineups lineup LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
         WHERE lineup.fantasy_round_id = $1 GROUP BY lineup.id`, [round.rows[0].id]);
      return { allowed: true, lineups: lineups.rows };
    });
  }

  async getRoundLineupOverview(leagueId: string, userId: string, roundId?: string): Promise<FantasyRoundOverview> {
    return this.withUser(userId, async (client) => {
      if (!roundId) return { roundId: "", isRoundOpen: false, confirmedCount: 0, revealedLineupsCount: 0 };
      const result = await client.query<any>(
        `SELECT fantasy_round.market_status, count(lineup.id)::int confirmed_count
         FROM public.fantasy_rounds fantasy_round JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
         LEFT JOIN public.fantasy_lineups lineup ON lineup.fantasy_round_id = fantasy_round.id
         WHERE round_item.id = $1 AND round_item.league_id = $2 GROUP BY fantasy_round.id`, [roundId, leagueId]);
      const row = result.rows[0]; const count = Number(row?.confirmed_count || 0); const open = row?.market_status === "open";
      return { roundId, isRoundOpen: open, confirmedCount: count, revealedLineupsCount: open ? 0 : count };
    });
  }

  async getMarketRoundInfo(leagueId: string, roundId: string, userId: string) {
    return this.withUser(userId, async (client) => {
      const round = await client.query<any>(
        `SELECT fantasy_round.id, fantasy_round.market_status, fantasy_round.fantasy_season_id
         FROM public.fantasy_rounds fantasy_round JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
         WHERE round_item.id = $1 AND round_item.league_id = $2`, [roundId, leagueId]);
      const item = round.rows[0];
      if (!item) return { isMarketOpen: false, playerPrices: new Map<string, number>(), userBudget: 0 };
      const [prices, account] = await Promise.all([
        client.query<any>("SELECT player_id,current_price FROM public.fantasy_player_prices WHERE fantasy_season_id=$1", [item.fantasy_season_id]),
        client.query<any>("SELECT current_budget FROM public.fantasy_accounts WHERE fantasy_season_id=$1 AND user_id=$2", [item.fantasy_season_id, userId]),
      ]);
      return { isMarketOpen: item.market_status === "open",
        playerPrices: new Map(prices.rows.map((row: any) => [row.player_id, Number(row.current_price)])),
        userBudget: Number(account.rows[0]?.current_budget || 0) };
    });
  }

  async saveLineup(params: { leagueId: string; roundId: string; userId: string; captainPlayerId: string;
    slots: FantasyLineupSlot[]; totalCost: number }) {
    try {
      return await this.withUser(params.userId, async (client) => {
        const result = await client.query<{ id: string }>(
          `SELECT public.save_fantasy_lineup($1::uuid,$2::uuid[],$3::uuid,NULL,NULL,NULL,$4::jsonb) id
           WHERE EXISTS (SELECT 1 FROM public.rounds WHERE id=$1::uuid AND league_id=$5::uuid)`,
          [params.roundId, params.slots.map((slot) => slot.playerId), params.captainPlayerId,
            JSON.stringify(params.slots), params.leagueId]);
        return result.rows[0]?.id ? { success: true, lineupId: result.rows[0].id }
          : { success: false, error: "Rodada não encontrada." };
      });
    } catch (error: any) { return { success: false, error: error.message }; }
  }

  async previewMarketV11(leagueId: string, userId: string) {
    try {
      return await this.withUser(userId, async (client) => {
        const result = await client.query<any>(
          `SELECT public.preview_fantasy_market_v11(season.id) data FROM public.fantasy_seasons season
           JOIN public.seasons core ON core.id=season.season_id
           WHERE season.league_id=$1 AND core.status='active' LIMIT 1`, [leagueId]);
        return result.rows[0] ? { success: true, data: result.rows[0].data }
          : { success: false, error: "O Cartola desta pelada ainda não foi iniciado." };
      });
    } catch (error: any) { return { success: false, error: error.message }; }
  }

  async repairLegacyLineups(leagueId: string, userId: string) {
    const result = await this.withUser(userId, async (client) => client.query<any>(
      `SELECT public.repair_legacy_saved_fantasy_lineups() data WHERE public.is_league_admin($1::uuid)`, [leagueId]));
    return { success: true, repairedCount: Number(result.rows[0]?.data?.repaired || 0) };
  }
}
