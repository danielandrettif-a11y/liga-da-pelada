import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { FantasyAdminRepository } from "../application/manage-fantasy-admin.js";
import type { FantasyAdminConfigData, FantasyRankingScope, FantasyUserRoundHistoryDetail, SeasonPassDashboardData } from "../domain/fantasy-admin.js";
import type { UserFantasyHistoryEntry } from "../domain/market-lineup.js";

export class PgFantasyAdminRepository implements FantasyAdminRepository {
  constructor(private readonly pool: Pool) {}
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
      const result = await client.query<any>(
        `SELECT pass.progress, reward.house, reward.reward_key
         FROM public.fantasy_seasons season
         LEFT JOIN public.fantasy_season_passes pass ON pass.fantasy_season_id=season.id AND pass.user_id=$2
         LEFT JOIN public.fantasy_season_pass_rewards reward ON reward.fantasy_season_id=season.id
         JOIN public.seasons core ON core.id=season.season_id AND core.status='active'
         WHERE season.league_id=$1 ORDER BY reward.house`, [leagueId, userId]);
      if (!result.rows.length) return { authenticated: true, available: false, progress: 0, maxProgress: 40, currentLevel: 0, rewards: [] };
      const progress = Number(result.rows[0]?.progress || 0);
      return { authenticated: true, available: true, progress, maxProgress: 40, currentLevel: progress,
        rewards: result.rows.filter((row: any) => row.house != null).map((row: any) => ({ level: Number(row.house),
          title: String(row.reward_key).replaceAll('_',' '), unlocked: progress >= Number(row.house), claimed: false })) };
    });
  }

  async getAdminData(leagueId: string, userId: string): Promise<FantasyAdminConfigData> {
    return this.withUser(userId, async (client) => {
      const [settings, session] = await Promise.all([
        client.query<any>("SELECT initial_budget FROM public.fantasy_settings WHERE league_id=$1", [leagueId]),
        client.query<any>("SELECT round_id FROM public.fantasy_test_sessions WHERE league_id=$1", [leagueId]),
      ]);
      return { initialBudget: Number(settings.rows[0]?.initial_budget || 55), marketOpenDelayMinutes: 0,
        isTestSessionActive: Boolean(session.rows[0]), testSessionRoundId: session.rows[0]?.round_id || null };
    });
  }

  async updateSettings(leagueId: string, settings: { initialBudget?: number }, userId: string) {
    return this.withUser(userId, async (client) => {
      await client.query("SELECT public.update_fantasy_settings_for_league($1::uuid,$2::jsonb)",
        [leagueId, JSON.stringify({ initial_budget: settings.initialBudget })]);
      return { success: true };
    });
  }

  async reprocessRound(leagueId: string, roundId: string, useCurrentRules: boolean | undefined, userId: string) {
    return this.withUser(userId, async (client) => {
      const rpc = useCurrentRules ? "reprocess_fantasy_with_current_rules" : "reprocess_fantasy_from_round";
      const result = await client.query<any>(
        `SELECT public.${rpc}($1::uuid) data WHERE EXISTS (SELECT 1 FROM public.rounds WHERE id=$1 AND league_id=$2)`,
        [roundId, leagueId]);
      if (!result.rows[0]) throw new Error("Rodada fora da pelada selecionada.");
      return { success: true, reprocessedLineupsCount: Number(result.rows[0].data?.affected_lineups || result.rows[0].data?.affected_finished_rounds || 0) };
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
