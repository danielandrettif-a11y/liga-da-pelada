import type { Pool } from "pg";
import { pgRoundStatisticsRepository } from "../../statistics/infrastructure/pg-round-statistics-repository.js";
import type { FantasyAdminRepository } from "../application/manage-fantasy-admin.js";
import type {
  FantasyAdminConfigData,
  FantasyRankingScope,
  FantasyUserRoundHistoryDetail,
  SeasonPassDashboardData,
} from "../domain/fantasy-admin.js";
import type { UserFantasyHistoryEntry } from "../domain/market-lineup.js";

export class PgFantasyAdminRepository implements FantasyAdminRepository {
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

  async getRankingPeriodInputs(leagueId: string, userId: string): Promise<{ accounts: any[]; rounds: any[]; lineups: any[] } | null> {
    return this.withClient(async (client) => {
      const access = await client.query("SELECT public.is_league_member($1::uuid) AS allowed", [leagueId]);
      if (!access.rows[0]?.allowed) return null;
      const season = await client.query(`SELECT fs.id FROM public.fantasy_seasons fs
        JOIN public.seasons s ON s.id=fs.season_id AND s.league_id=fs.league_id
        WHERE fs.league_id=$1::uuid AND s.status='active' LIMIT 1`, [leagueId]);
      if (!season.rows[0]) return { accounts: [], rounds: [], lineups: [] };
      const fantasySeasonId = season.rows[0].id;
      const accounts = await client.query(`SELECT id,user_id,total_points::float8,current_budget::float8,rounds_played,best_round_points::float8
        FROM public.fantasy_accounts WHERE fantasy_season_id=$1::uuid`, [fantasySeasonId]);
      const rounds = await client.query(`SELECT fr.id,fr.round_id,fr.market_status,
        jsonb_build_object('date',r.date,'status',r.status) AS round FROM public.fantasy_rounds fr
        JOIN public.rounds r ON r.id=fr.round_id WHERE fr.fantasy_season_id=$1::uuid AND r.league_id=$2::uuid`, [fantasySeasonId, leagueId]);
      const lineups = await client.query(`SELECT l.fantasy_round_id,l.user_id,l.total_points::float8,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('total_points',p.total_points,'captain_bonus',p.captain_bonus,
          'slot_role',p.slot_role,'player_profile_locked',p.player_profile_locked))
          FROM public.fantasy_lineup_players p WHERE p.lineup_id=l.id),'[]'::jsonb) AS fantasy_lineup_players
        FROM public.fantasy_lineups l JOIN public.fantasy_rounds fr ON fr.id=l.fantasy_round_id
        JOIN public.rounds r ON r.id=fr.round_id
        WHERE fr.fantasy_season_id=$1::uuid AND r.league_id=$2::uuid AND l.status='scored'
          AND (fr.market_status <> 'open' OR r.status='finished')`, [fantasySeasonId, leagueId]);
      return { accounts: accounts.rows, rounds: rounds.rows, lineups: lineups.rows };
    }, userId);
  }

  async getRankingRawEntries(
    leagueId: string,
    scope: FantasyRankingScope,
    roundId?: string
  ): Promise<Array<{
    userId: string;
    userName: string;
    userAvatarUrl: string | null;
    totalPoints: number;
    patrimony: number;
    lastRoundPoints: number | null;
    lineupsCount: number;
  }>> {
    return this.withClient(async (client) => {
      let query = `
        SELECT fl.user_id,
               COALESCE(p.name, p.nickname, 'Cartoleiro') as user_name,
               p.avatar_url as user_avatar_url,
               COALESCE(SUM(fl.total_points), 0) as total_points,
               COALESCE(MAX(fl.budget_after), 100) as patrimony,
               COUNT(fl.id)::int as lineups_count
        FROM public.fantasy_lineups fl
        JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
        JOIN public.rounds r ON r.id = fr.round_id
        LEFT JOIN public.account_profiles ap ON ap.user_id = fl.user_id
        LEFT JOIN public.players p ON p.id = ap.player_id
        WHERE r.league_id = $1
      `;
      const params: any[] = [leagueId];

      if (scope === "round" && roundId) {
        query += ` AND fr.round_id = $2`;
        params.push(roundId);
      }

      query += ` GROUP BY fl.user_id, p.name, p.nickname, p.avatar_url`;

      const { rows } = await client.query(query, params);
      return rows.map((r: any) => ({
        userId: r.user_id,
        userName: r.user_name,
        userAvatarUrl: r.user_avatar_url ?? null,
        totalPoints: Math.round(Number(r.total_points ?? 0) * 100) / 100,
        patrimony: Math.round(Number(r.patrimony ?? 100) * 100) / 100,
        lastRoundPoints: null,
        lineupsCount: Number(r.lineups_count ?? 0),
      }));
    });
  }

  async getUserHistory(leagueId: string, userId: string): Promise<UserFantasyHistoryEntry[]> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT fr.round_id, r.number as round_number, COALESCE(fl.total_points, 0) as score,
                p.name as captain_name
         FROM public.fantasy_lineups fl
         JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
         JOIN public.rounds r ON r.id = fr.round_id
         LEFT JOIN public.players p ON p.id = fl.captain_player_id
         WHERE r.league_id = $1 AND fl.user_id = $2
         ORDER BY r.number DESC`,
        [leagueId, userId]
      );

      return rows.map((r: any, idx: number) => ({
        roundId: r.round_id,
        roundNumber: Number(r.round_number),
        score: Math.round(Number(r.score) * 100) / 100,
        rankInRound: idx + 1,
        patrimonyAfter: 100,
        captainName: r.captain_name ?? null,
      }));
    });
  }

  async getUserRoundHistory(
    leagueId: string,
    userId: string,
    roundId: string
  ): Promise<FantasyUserRoundHistoryDetail | null> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT fl.id as lineup_id, fr.round_id, r.number as round_number,
                fl.captain_player_id, fl.total_points as score
         FROM public.fantasy_lineups fl
         JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
         JOIN public.rounds r ON r.id = fr.round_id
         WHERE r.league_id = $1 AND fl.user_id = $2 AND fr.round_id = $3 LIMIT 1`,
        [leagueId, userId, roundId]
      );
      if (rows.length === 0) return null;
      const row = rows[0];

      const playersRes = await client.query(
        `SELECT flp.slot_role, flp.player_id,
                COALESCE(flp.player_name_locked, p.name, 'Atleta') as player_name,
                COALESCE(flp.total_points, 0) as score
         FROM public.fantasy_lineup_players flp
         LEFT JOIN public.players p ON p.id = flp.player_id
         WHERE flp.lineup_id = $1
         ORDER BY flp.slot_index ASC NULLS LAST`,
        [row.lineup_id]
      );

      const slots = playersRes.rows.map((s: any) => ({
        slotRole: s.slot_role ?? "ATA",
        playerId: s.player_id,
        playerName: s.player_name ?? "Atleta",
        score: Number(s.score ?? 0),
        isCaptain: s.player_id === row.captain_player_id,
      }));

      return {
        userId,
        roundId,
        roundNumber: Number(row.round_number),
        score: Number(row.score ?? 0),
        captainPlayerId: row.captain_player_id,
        captainMultiplier: 1.5,
        slots,
      };
    });
  }

  async getSeasonPassDashboard(leagueId: string, userId: string): Promise<SeasonPassDashboardData> {
    return this.withClient(async (client) => {
      const empty: SeasonPassDashboardData = { authenticated: true, available: false, progress: 0, maxProgress: 40,
        mode: "athlete", participations: 0, activeWeeks: 0, validLineups: 0, shopCycleRemainder: 0,
        shopBonusPoints: 0, nextMilestone: 1, playerName: null, playerAvatarUrl: null, events: [] };
      const context = await client.query(`SELECT fs.id AS fantasy_season_id, player.name, player.avatar_url, player.member_category
        FROM public.account_profiles profile
        JOIN public.players player ON player.id=profile.player_id
        JOIN public.seasons s ON s.league_id=$1::uuid AND s.status='active'
        JOIN public.fantasy_seasons fs ON fs.season_id=s.id AND fs.league_id=$1::uuid
        WHERE profile.user_id=$2::uuid AND public.is_league_member($1::uuid) LIMIT 1`, [leagueId, userId]);
      const current = context.rows[0];
      if (!current) return empty;
      const passResult = await client.query(`SELECT progress, progression_mode, participations, active_weeks, valid_lineups,
        goals_assists_remainder, shop_bonus_points FROM public.fantasy_season_passes
        WHERE fantasy_season_id=$1::uuid AND user_id=$2::uuid`, [current.fantasy_season_id, userId]);
      const eventResult = await client.query(`SELECT e.id, e.event_type, e.houses, e.source_round_id, e.created_at,
        r.number AS round_number, r.date AS round_date
        FROM public.fantasy_season_pass_events e LEFT JOIN public.rounds r ON r.id=e.source_round_id
        WHERE e.fantasy_season_id=$1::uuid AND e.user_id=$2::uuid ORDER BY e.created_at DESC LIMIT 8`, [current.fantasy_season_id, userId]);
      const pass = passResult.rows[0];
      const progress = Number(pass?.progress || 0);
      return {
        authenticated: true, available: true, progress, maxProgress: 40,
        mode: pass?.progression_mode === "community" || ["wag", "supporter"].includes(current.member_category) ? "community" : "athlete",
        participations: Number(pass?.participations || 0), activeWeeks: Number(pass?.active_weeks || 0),
        validLineups: Number(pass?.valid_lineups || 0), shopCycleRemainder: Number(pass?.goals_assists_remainder || 0),
        shopBonusPoints: Number(pass?.shop_bonus_points || 0),
        nextMilestone: [1, 5, 10, 18, 25, 32, 40].find(m => m > progress) ?? null,
        playerName: current.name || null, playerAvatarUrl: current.avatar_url || null,
        events: eventResult.rows.map((row: any) => ({ id: row.id, eventType: row.event_type, houses: Number(row.houses),
          roundId: row.source_round_id || null, roundNumber: row.round_number ?? null,
          roundDate: row.round_date ?? null, createdAt: row.created_at })),
      };
    }, userId);
  }

  async getAdminData(leagueId: string, userId: string): Promise<FantasyAdminConfigData> {
    return this.withClient(async (client) => {
      const guard = await client.query("SELECT public.is_league_admin($1::uuid) AS allowed", [leagueId]);
      if (!guard.rows[0]?.allowed) throw new Error("Acesso restrito a administradores da liga.");
      const settings = await client.query("SELECT to_jsonb(s) AS value FROM public.fantasy_settings s WHERE s.league_id=$1::uuid", [leagueId]);
      const season = await client.query(`SELECT fs.id, s.id AS season_id FROM public.seasons s
        LEFT JOIN public.fantasy_seasons fs ON fs.season_id=s.id AND fs.league_id=s.league_id
        WHERE s.league_id=$1::uuid AND s.status='active' LIMIT 1`, [leagueId]);
      const fantasySeasonId = season.rows[0]?.id ?? null;
      const seasonId = season.rows[0]?.season_id ?? null;
      const rounds = await client.query(`SELECT fr.id, fr.market_status, fr.processed_at, fr.rules_version, fr.scoring_version,
        json_build_object('id',r.id,'number',r.number,'date',r.date,'status',r.status,'round_type',r.round_type) AS round
        FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id=fr.round_id
        WHERE fr.fantasy_season_id=$1::uuid AND r.league_id=$2::uuid ORDER BY fr.created_at DESC LIMIT 20`, [fantasySeasonId, leagueId]);
      const roundDetail = `jsonb_build_object('id',r.id,'number',r.number,'date',r.date,'start_time',r.start_time,'status',r.status,'round_type',r.round_type,
        'round_players',jsonb_build_array(jsonb_build_object('count',(SELECT count(*) FROM public.round_players rp WHERE rp.round_id=r.id))),
        'matches',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'status',m.status,'started_at',m.started_at)) FROM public.matches m WHERE m.round_id=r.id),'[]'::jsonb))`;
      const session = await client.query(`SELECT to_jsonb(ts) || jsonb_build_object('round', ${roundDetail}) AS value
        FROM public.fantasy_test_sessions ts JOIN public.rounds r ON r.id=ts.round_id AND r.league_id=ts.league_id
        WHERE ts.league_id=$1::uuid LIMIT 1`, [leagueId]);
      const friendly = await client.query(`SELECT ${roundDetail} AS value FROM public.rounds r
        WHERE r.league_id=$1::uuid AND r.season_id=$2::uuid AND r.round_type='friendly'
        ORDER BY r.date DESC LIMIT 12`, [leagueId, seasonId]);
      let marketStatus: unknown = null;
      if (fantasySeasonId) {
        await client.query("SAVEPOINT fantasy_market_status");
        try {
          const result = await client.query("SELECT public.get_fantasy_market_v11_status($1::uuid) AS value", [fantasySeasonId]);
          marketStatus = result.rows[0]?.value ?? null;
          await client.query("RELEASE SAVEPOINT fantasy_market_status");
        } catch {
          await client.query("ROLLBACK TO SAVEPOINT fantasy_market_status");
          await client.query("RELEASE SAVEPOINT fantasy_market_status");
        }
      }
      return { settings: settings.rows[0]?.value ?? null, rounds: rounds.rows,
        testSession: session.rows[0]?.value ?? null, friendlyRounds: friendly.rows.map((row: any) => row.value), marketStatus };
    }, userId);
  }

  async updateSettings(
    leagueId: string,
    settings: Record<string, unknown>,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      return await this.withClient(async (client) => {
        const result = await client.query("SELECT public.update_fantasy_settings_for_league($1::uuid, $2::jsonb) AS result", [leagueId, JSON.stringify(settings)]);
        if (result.rows[0]?.result !== true) throw new Error("O banco não confirmou a atualização.");
        return { success: true };
      }, userId);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async reprocessRound(
    leagueId: string,
    roundId: string,
    userId: string,
    useCurrentRules?: boolean
  ): Promise<{ success: boolean; affectedRounds?: number; error?: string }> {
    try {
      await pgRoundStatisticsRepository(this.pool).recalculateRoundStats({ userId }, leagueId, roundId);
      return await this.withClient(async (client) => {
        const scoped = await client.query("SELECT 1 FROM public.rounds WHERE id=$1::uuid AND league_id=$2::uuid AND public.is_league_admin(league_id)", [roundId, leagueId]);
        if (!scoped.rowCount) return { success: false, error: "Rodada fora da pelada selecionada." };
        const command = useCurrentRules ? "reprocess_fantasy_with_current_rules" : "reprocess_fantasy_from_round";
        const result = await client.query(`SELECT public.${command}($1::uuid) AS result`, [roundId]);
        const value = result.rows[0]?.result;
        if (value == null || value === false) throw new Error("O banco não confirmou o reprocessamento.");
        return useCurrentRules ? { success: true, affectedRounds: Number(value.affected_finished_rounds ?? 0) } : { success: true };
      }, userId);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private async changeTestSession(leagueId: string, roundId: string, userId: string, operation: "create" | "process" | "reset"): Promise<{ success: boolean; error?: string }> {
    const commands = { create: "create_fantasy_test_session", process: "process_fantasy_test_round", reset: "reset_fantasy_test_session" } as const;
    try {
      return await this.withClient(async (client) => {
        const scoped = await client.query("SELECT 1 FROM public.rounds WHERE id=$1::uuid AND league_id=$2::uuid AND public.is_league_admin(league_id)", [roundId, leagueId]);
        if (!scoped.rowCount) return { success: false, error: "Rodada fora da pelada selecionada." };
        const result = await client.query(`SELECT public.${commands[operation]}($1::uuid) AS result`, [roundId]);
        if (result.rows[0]?.result == null || result.rows[0].result === false) throw new Error("O banco não confirmou a operação.");
        return { success: true };
      }, userId);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async createTestSession(leagueId: string, roundId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    return this.changeTestSession(leagueId, roundId, userId, "create");
  }

  async processTestSession(leagueId: string, roundId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    return this.changeTestSession(leagueId, roundId, userId, "process");
  }

  async resetTestSession(leagueId: string, roundId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    return this.changeTestSession(leagueId, roundId, userId, "reset");
  }
}
