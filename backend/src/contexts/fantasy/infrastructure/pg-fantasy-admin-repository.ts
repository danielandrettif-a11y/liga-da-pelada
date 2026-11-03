import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { FantasyAdminRepository } from "../application/manage-fantasy-admin.js";
import type { FantasyAdminConfigData, FantasyRankingScope, FantasyUserRoundHistoryDetail, SeasonPassDashboardData } from "../domain/fantasy-admin.js";
import type { UserFantasyHistoryEntry } from "../domain/market-lineup.js";
import type { RoundStatisticsRepository } from "../../statistics/application/manage-round-statistics.js";

export class PgFantasyAdminRepository implements FantasyAdminRepository {
  constructor(private readonly pool: Pool, private readonly roundStatistics: RoundStatisticsRepository) {}
  private withUser<T>(userId: string, operation: (client: PoolClient) => Promise<T>) {
    return withAuthenticatedTransaction(this.pool, { userId }, operation);
  }

  async isLeagueAdmin(leagueId: string, userId: string) {
    return this.withUser(userId, async (client) => Boolean((await client.query(
      "SELECT 1 WHERE public.is_league_admin($1::uuid)", [leagueId])).rowCount));
  }

  async getRankingRawEntries(leagueId: string, scope: FantasyRankingScope, actorUserId: string, roundId?: string) {
    return this.withUser(actorUserId, async (client) => {
      const result = await client.query<any>(
        `WITH selected AS (
           SELECT lineup.user_id, sum(lineup.total_points) points, count(*)::int lineups_count,
                  max(lineup.total_points) FILTER (WHERE round_item.number = latest.latest_number) last_round_points
           FROM public.fantasy_lineups lineup
           JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
           JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id = fantasy_round.fantasy_season_id
           JOIN public.seasons core_season ON core_season.id=fantasy_season.season_id
           JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
           CROSS JOIN LATERAL (SELECT max(number) latest_number FROM public.rounds WHERE league_id = $1 AND status = 'finished') latest
           WHERE fantasy_season.league_id = $1 AND ($2='general' OR core_season.status='active')
             AND ($2::text NOT IN ('round','month') OR ($2 = 'round' AND round_item.id = $3::uuid)
               OR ($2 = 'month' AND date_trunc('month', round_item.date) = date_trunc('month', current_date)))
           GROUP BY lineup.user_id
         )
         SELECT account.user_id, COALESCE(player.name, 'Jogador') user_name,
                player.avatar_url, CASE WHEN $2 IN ('round','month') THEN COALESCE(selected.points,0)
                  ELSE COALESCE(selected.points,account.total_points,0) END total_points,
                account.current_budget patrimony, selected.last_round_points, COALESCE(selected.lineups_count,0) lineups_count
         FROM public.fantasy_accounts account
         JOIN public.fantasy_seasons season ON season.id = account.fantasy_season_id
         JOIN public.seasons core_season ON core_season.id=season.season_id
         LEFT JOIN selected ON selected.user_id = account.user_id
         LEFT JOIN public.account_profiles profile ON profile.user_id = account.user_id
         LEFT JOIN public.players player ON player.id = profile.player_id
         WHERE season.league_id = $1 AND ($2='general' OR core_season.status='active')`, [leagueId, scope, roundId || null]);
      return result.rows.map((row: any) => ({ userId: row.user_id, userName: row.user_name,
        userAvatarUrl: row.avatar_url || null, totalPoints: Number(row.total_points), patrimony: Number(row.patrimony),
        lastRoundPoints: row.last_round_points == null ? null : Number(row.last_round_points), lineupsCount: Number(row.lineups_count) }));
    });
  }

  async getUserHistory(leagueId: string, userId: string, actorUserId: string): Promise<UserFantasyHistoryEntry[]> {
    return this.withUser(actorUserId, async (client) => {
      const result = await client.query<any>(
        `SELECT round_item.id round_id, round_item.number, lineup.total_points, lineup.round_position,
                lineup.budget_after, captain.name captain_name
         FROM public.fantasy_lineups lineup JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
         JOIN public.fantasy_seasons season ON season.id=fantasy_round.fantasy_season_id
         JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
         LEFT JOIN public.players captain ON captain.id=lineup.captain_player_id
         WHERE season.league_id=$1 AND lineup.user_id=$2 ORDER BY round_item.number DESC`, [leagueId, userId]);
      return result.rows.map((row: any) => ({ roundId: row.round_id, roundNumber: Number(row.number), score: Number(row.total_points),
        rankInRound: Number(row.round_position || 0), patrimonyAfter: Number(row.budget_after || 0), captainName: row.captain_name || null }));
    });
  }

  async getUserRoundHistory(leagueId: string, userId: string, roundId: string, actorUserId: string): Promise<FantasyUserRoundHistoryDetail | null> {
    return this.withUser(actorUserId, async (client) => {
      const result = await client.query<any>(
        `SELECT lineup.user_id, round_item.id round_id, round_item.number, lineup.total_points,
                lineup.captain_player_id, COALESCE((fantasy_round.settings_snapshot->>'captain_multiplier')::numeric,1) captain_multiplier,
                COALESCE(jsonb_agg(jsonb_build_object('slotRole', item.slot_role, 'playerId', item.player_id,
                  'playerName', player.name, 'score', item.total_points, 'isCaptain', item.player_id=lineup.captain_player_id)
                  ORDER BY item.created_at) FILTER (WHERE item.id IS NOT NULL),'[]'::jsonb) slots
         FROM public.fantasy_lineups lineup JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
         JOIN public.fantasy_seasons season ON season.id=fantasy_round.fantasy_season_id
         JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
         LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id=lineup.id
         LEFT JOIN public.players player ON player.id=item.player_id
         WHERE season.league_id=$1 AND lineup.user_id=$2 AND round_item.id=$3
         GROUP BY lineup.id, round_item.id, round_item.number, fantasy_round.settings_snapshot`, [leagueId, userId, roundId]);
      const row = result.rows[0];
      return row ? { userId: row.user_id, roundId: row.round_id, roundNumber: Number(row.number), score: Number(row.total_points),
        captainPlayerId: row.captain_player_id, captainMultiplier: Number(row.captain_multiplier), slots: row.slots || [] } : null;
    });
  }

  async getSeasonPassDashboard(leagueId: string, userId: string): Promise<SeasonPassDashboardData> {
    return this.withUser(userId, async (client) => {
      const [profile, pass, events] = await Promise.all([
        client.query<any>(
          `SELECT player.name,player.avatar_url,player.member_category
           FROM public.account_profiles profile JOIN public.players player ON player.id=profile.player_id
           JOIN public.league_members member ON member.player_id=player.id AND member.league_id=$1::uuid AND member.is_active
           WHERE profile.user_id=$2::uuid LIMIT 1`, [leagueId, userId]),
        client.query<any>(
          `SELECT pass.progress,pass.progression_mode,pass.participations,pass.active_weeks,
                  pass.valid_lineups,pass.goals_assists_remainder,pass.shop_bonus_points
           FROM public.fantasy_season_passes pass
           JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=pass.fantasy_season_id
           JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
           WHERE fantasy_season.league_id=$1::uuid AND pass.user_id=$2::uuid LIMIT 1`, [leagueId, userId]),
        client.query<any>(
          `SELECT event.id,event.event_type,event.houses,event.source_round_id,event.created_at,
                  round_item.number round_number,round_item.date round_date
           FROM public.fantasy_season_pass_events event
           JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=event.fantasy_season_id
           JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
           LEFT JOIN public.rounds round_item ON round_item.id=event.source_round_id
           WHERE fantasy_season.league_id=$1::uuid AND event.user_id=$2::uuid
           ORDER BY event.created_at DESC LIMIT 8`, [leagueId, userId]),
      ]);
      const player = profile.rows[0];
      if (!player) return { authenticated: true, available: false, progress: 0, maxProgress: 40,
        mode: "athlete", participations: 0, activeWeeks: 0, validLineups: 0, shopCycleRemainder: 0,
        shopBonusPoints: 0, nextMilestone: 1, playerName: null, playerAvatarUrl: null, events: [] };
      const row = pass.rows[0];
      const progress = Number(row?.progress || 0);
      const milestones = [1, 5, 10, 18, 25, 32, 40];
      return { authenticated: true, available: true, progress, maxProgress: 40,
        mode: row?.progression_mode === "community" || ["wag", "supporter"].includes(player.member_category)
          ? "community" : "athlete",
        participations: Number(row?.participations || 0), activeWeeks: Number(row?.active_weeks || 0),
        validLineups: Number(row?.valid_lineups || 0), shopCycleRemainder: Number(row?.goals_assists_remainder || 0),
        shopBonusPoints: Number(row?.shop_bonus_points || 0),
        nextMilestone: milestones.find((milestone) => milestone > progress) ?? null,
        playerName: player.name || null, playerAvatarUrl: player.avatar_url || null,
        events: events.rows.map((event: any) => ({ id: event.id, eventType: event.event_type,
          houses: Number(event.houses), roundId: event.source_round_id || null,
          roundNumber: event.round_number == null ? null : Number(event.round_number),
          roundDate: event.round_date || null, createdAt: event.created_at })) };
    });
  }

  async getAdminData(leagueId: string, userId: string): Promise<FantasyAdminConfigData> {
    return this.withUser(userId, async (client) => {
      const fantasySeason = await client.query<any>(
        `SELECT fantasy_season.id FROM public.fantasy_seasons fantasy_season
         JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
         WHERE fantasy_season.league_id=$1::uuid LIMIT 1`, [leagueId]);
      const fantasySeasonId = fantasySeason.rows[0]?.id || null;
      const [settings, rounds, session, friendlyRounds, marketStatus] = await Promise.all([
        client.query<any>("SELECT * FROM public.fantasy_settings WHERE league_id=$1::uuid", [leagueId]),
        fantasySeasonId ? client.query<any>(
          `SELECT fantasy_round.id,fantasy_round.market_status,fantasy_round.processed_at,
                  fantasy_round.rules_version,fantasy_round.scoring_version,
                  jsonb_build_object('id',round_item.id,'number',round_item.number,'date',round_item.date,
                    'status',round_item.status,'round_type',round_item.round_type) round
           FROM public.fantasy_rounds fantasy_round JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
           WHERE fantasy_round.fantasy_season_id=$1::uuid ORDER BY fantasy_round.created_at DESC LIMIT 20`, [fantasySeasonId])
          : Promise.resolve({ rows: [] }),
        client.query<any>(
          `SELECT session_item.*,jsonb_build_object('id',round_item.id,'number',round_item.number,
             'date',round_item.date,'start_time',round_item.start_time,'status',round_item.status,
             'round_type',round_item.round_type,'round_players',jsonb_build_array(jsonb_build_object('count',
               (SELECT count(*) FROM public.round_players player WHERE player.round_id=round_item.id))),
             'matches',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',match_item.id,'status',match_item.status,
               'started_at',match_item.started_at)) FROM public.matches match_item WHERE match_item.round_id=round_item.id),'[]'::jsonb)) round
           FROM public.fantasy_test_sessions session_item JOIN public.rounds round_item ON round_item.id=session_item.round_id
           WHERE session_item.league_id=$1::uuid LIMIT 1`, [leagueId]),
        client.query<any>(
          `SELECT round_item.id,round_item.number,round_item.date,round_item.start_time,round_item.status,round_item.round_type,
                  jsonb_build_array(jsonb_build_object('count',(SELECT count(*) FROM public.round_players player WHERE player.round_id=round_item.id))) round_players,
                  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',match_item.id,'status',match_item.status,'started_at',match_item.started_at))
                    FROM public.matches match_item WHERE match_item.round_id=round_item.id),'[]'::jsonb) matches
           FROM public.rounds round_item JOIN public.seasons core ON core.id=round_item.season_id AND core.status='active'
           WHERE round_item.league_id=$1::uuid AND round_item.round_type='friendly'
           ORDER BY round_item.date DESC LIMIT 12`, [leagueId]),
        fantasySeasonId ? client.query<any>("SELECT public.get_fantasy_market_v11_status($1::uuid) data", [fantasySeasonId])
          : Promise.resolve({ rows: [] }),
      ]);
      return { settings: settings.rows[0] || { initial_budget: 55, initial_player_price: 10,
          min_player_price: 5, max_player_price: 20, captain_multiplier: 1.5 },
        rounds: rounds.rows, testSession: session.rows[0] || null,
        friendlyRounds: friendlyRounds.rows, marketStatus: marketStatus.rows[0]?.data || null };
    });
  }

  async updateSettings(leagueId: string, settings: Record<string, number>, userId: string) {
    return this.withUser(userId, async (client) => {
      await client.query("SELECT public.update_fantasy_settings_for_league($1::uuid,$2::jsonb)",
        [leagueId, JSON.stringify(settings)]);
      return { success: true };
    });
  }

  rebuildRoundStats(leagueId: string, roundId: string, userId: string) {
    return this.roundStatistics.recalculateRoundStats({ userId }, leagueId, roundId);
  }

  async reprocessRound(leagueId: string, roundId: string, useCurrentRules: boolean | undefined, userId: string) {
    return this.withUser(userId, async (client) => {
      const rpc = useCurrentRules ? "reprocess_fantasy_with_current_rules" : "reprocess_fantasy_from_round";
      const result = await client.query<any>(
        `SELECT public.${rpc}($1::uuid) data WHERE EXISTS (SELECT 1 FROM public.rounds WHERE id=$1 AND league_id=$2)`,
        [roundId, leagueId]);
      if (!result.rows[0]) throw new Error("Rodada fora da pelada selecionada.");
      return { success: true, affectedRounds: Number(result.rows[0].data?.affected_finished_rounds || 1) };
    });
  }

  private async testSession(leagueId: string, roundId: string, userId: string, rpc: string) {
    return this.withUser(userId, async (client) => {
      const result = await client.query(
        `SELECT public.${rpc}($1::uuid) data WHERE EXISTS (SELECT 1 FROM public.rounds WHERE id=$1 AND league_id=$2)`,
        [roundId, leagueId]);
      if (!result.rows[0]) throw new Error("Rodada fora da pelada selecionada.");
      return { success: true };
    });
  }
  createTestSession(leagueId: string, roundId: string, userId: string) { return this.testSession(leagueId, roundId, userId, "create_fantasy_test_session"); }
  processTestSession(leagueId: string, roundId: string, userId: string) { return this.testSession(leagueId, roundId, userId, "process_fantasy_test_round"); }
  resetTestSession(leagueId: string, roundId: string, userId: string) { return this.testSession(leagueId, roundId, userId, "reset_fantasy_test_session"); }
}
