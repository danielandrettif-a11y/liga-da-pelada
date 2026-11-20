import type { Pool } from "pg";
import type { FantasyMarketLineupRepository } from "../application/manage-market-lineup.js";
import { revealedLineupScore } from "../domain/revealed-score.js";
import type {
  FantasyLineupSlot,
  FantasyLineupSubmission,
  FantasyMarketDashboardData,
  FantasyMarketPlayerSummary,
  FantasyMarketQuickHighlights,
  FantasyPlayerPerformanceDetail,
  FantasyRoundOverview,
  FantasyUserSummary,
  UserFantasyHistoryEntry,
  MyFantasyHistoryRow,
} from "../domain/market-lineup.js";

export class PgFantasyMarketLineupRepository implements FantasyMarketLineupRepository {
  constructor(private readonly pool: Pool) {}

  private async withClient<T>(callback: (client: any) => Promise<T>, userId?: string): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      if (userId) {
        await client.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true), set_config('request.jwt.claims',$2,true), set_config('search_path','public, auth',true)", [userId, JSON.stringify({ sub: userId, role: "authenticated" })]);
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

  async getMarketSource(leagueId: string, userId: string): Promise<unknown | null> {
    return this.withClient(async (client) => {
      const season = await client.query(`SELECT fs.id FROM public.fantasy_seasons fs
        JOIN public.seasons s ON s.id=fs.season_id AND s.league_id=fs.league_id
        WHERE fs.league_id=$1::uuid AND s.status='active' AND public.is_league_member(fs.league_id) LIMIT 1`, [leagueId]);
      if (!season.rows[0]) return null;
      const result = await client.query("SELECT public.get_scoped_fantasy_market_source($1::uuid) AS value", [season.rows[0].id]);
      return result.rows[0]?.value ?? null;
    }, userId);
  }

  async getMarketContext(leagueId: string, userId: string): Promise<{ seasonId: string; settings: any; testSession: any; fantasySeason: any; fantasyRounds: any[]; marketHealth: any; marketVersion: string | null } | null> {
    return this.withClient(async (client) => {
      const active = await client.query(`SELECT s.id FROM public.seasons s
        WHERE s.league_id=$1::uuid AND s.status='active' AND public.is_league_member(s.league_id) LIMIT 1`, [leagueId]);
      if (!active.rows[0]) return null;
      const seasonId = active.rows[0].id;
      const settings = await client.query("SELECT to_jsonb(s) AS value FROM public.fantasy_settings s WHERE s.league_id=$1::uuid", [leagueId]);
      const fantasySeason = await client.query(`SELECT id,initial_budget::float8,initial_player_price::float8
        FROM public.fantasy_seasons WHERE league_id=$1::uuid AND season_id=$2::uuid LIMIT 1`, [leagueId, seasonId]);
      const session = await client.query(`SELECT to_jsonb(ts) || jsonb_build_object('round',jsonb_build_object(
        'id',r.id,'number',r.number,'date',r.date,'start_time',r.start_time,'status',r.status,'round_type',r.round_type,
        'round_players',COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id',rp.player_id)) FROM public.round_players rp WHERE rp.round_id=r.id),'[]'::jsonb),
        'teams',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'position',t.position,'color',t.color,'crest_url',t.crest_url,
          'team_players',COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id',tp.player_id,'goalkeeper_order',tp.goalkeeper_order,'loan_order',tp.loan_order,
            'players',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'name',p.name,'nickname',p.nickname,'avatar_url',p.avatar_url,'player_profile',p.player_profile,'is_goalkeeper',p.is_goalkeeper) END))
            FROM public.team_players tp LEFT JOIN public.players p ON p.id=tp.player_id WHERE tp.team_id=t.id),'[]'::jsonb)))
          FROM public.teams t WHERE t.round_id=r.id),'[]'::jsonb),
        'matches',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'status',m.status)) FROM public.matches m WHERE m.round_id=r.id),'[]'::jsonb))) AS value
        FROM public.fantasy_test_sessions ts JOIN public.rounds r ON r.id=ts.round_id AND r.league_id=ts.league_id
        WHERE ts.league_id=$1::uuid AND ts.season_id=$2::uuid AND ts.status IN ('open','in_progress') LIMIT 1`, [leagueId, seasonId]);
      const fantasySeasonRow = fantasySeason.rows[0] ?? null;
      const roundRows = await client.query(`SELECT to_jsonb(fr) || jsonb_build_object('round',jsonb_build_object(
        'id',r.id,'number',r.number,'date',r.date,'start_time',r.start_time,'status',r.status,'round_type',r.round_type,
        'preparation_stage',r.preparation_stage,'suppress_goalkeeper_rewards',r.suppress_goalkeeper_rewards,
        'callups',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'status',c.status,
          'entries',COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id',ce.player_id,'status',ce.status)) FROM public.callup_entries ce WHERE ce.callup_id=c.id),'[]'::jsonb))) FROM public.callups c WHERE c.round_id=r.id),'[]'::jsonb),
        'round_players',COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id',rp.player_id)) FROM public.round_players rp WHERE rp.round_id=r.id),'[]'::jsonb),
        'round_payments',COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id',payment.player_id,'paid',payment.paid)) FROM public.round_payments payment WHERE payment.round_id=r.id),'[]'::jsonb),
        'teams',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'position',t.position,'color',t.color,'crest_url',t.crest_url,
          'team_players',COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id',tp.player_id,'goalkeeper_order',tp.goalkeeper_order,'loan_order',tp.loan_order,
            'players',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'name',p.name,'nickname',p.nickname,'avatar_url',p.avatar_url,'player_profile',p.player_profile,'is_goalkeeper',p.is_goalkeeper) END))
            FROM public.team_players tp LEFT JOIN public.players p ON p.id=tp.player_id WHERE tp.team_id=t.id),'[]'::jsonb)))
          FROM public.teams t WHERE t.round_id=r.id),'[]'::jsonb),
        'matches',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'status',m.status)) FROM public.matches m WHERE m.round_id=r.id),'[]'::jsonb))) AS value
        FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id=fr.round_id
        WHERE fr.fantasy_season_id=$1::uuid AND r.league_id=$2::uuid`, [fantasySeasonRow?.id ?? null, leagueId]);
      let marketHealth: any = null;
      let marketVersion: string | null = null;
      if (fantasySeasonRow) {
        for (const [functionName, assign] of [
          ["get_fantasy_market_v11_public_health", (value: any) => { marketHealth = value; }],
          ["get_fantasy_market_cache_version", (value: any) => { marketVersion = value; }],
        ] as const) {
          await client.query("SAVEPOINT market_context_read");
          try {
            const result = await client.query(`SELECT public.${functionName}($1::uuid) AS value`, [fantasySeasonRow.id]);
            assign(result.rows[0]?.value ?? null);
            await client.query("RELEASE SAVEPOINT market_context_read");
          } catch {
            await client.query("ROLLBACK TO SAVEPOINT market_context_read");
            await client.query("RELEASE SAVEPOINT market_context_read");
          }
        }
      }
      return { seasonId, settings: settings.rows[0]?.value ?? null, testSession: session.rows[0]?.value ?? null,
        fantasySeason: fantasySeasonRow, fantasyRounds: roundRows.rows.map((row: any) => row.value), marketHealth, marketVersion };
    }, userId);
  }

  async getPersonalMarketInputs(leagueId: string, userId: string, activeRoundId?: string, latestRoundId?: string, testSessionId?: string): Promise<any | null> {
    return this.withClient(async (client) => {
      if (activeRoundId && testSessionId) return null;
      const season = await client.query(`SELECT fs.id FROM public.fantasy_seasons fs
        JOIN public.seasons s ON s.id=fs.season_id AND s.league_id=fs.league_id
        WHERE fs.league_id=$1::uuid AND s.status='active' AND public.is_league_member(fs.league_id) LIMIT 1`, [leagueId]);
      if (!season.rows[0]) return null;
      const seasonId = season.rows[0].id;
      if (testSessionId) {
        const session = await client.query(`SELECT ts.id FROM public.fantasy_test_sessions ts
          JOIN public.fantasy_seasons fs ON fs.season_id=ts.season_id AND fs.league_id=ts.league_id
          JOIN public.rounds r ON r.id=ts.round_id AND r.league_id=ts.league_id AND r.season_id=ts.season_id
          WHERE ts.id=$1::uuid AND ts.league_id=$2::uuid AND fs.id=$3::uuid
            AND ts.status IN ('open','in_progress')`, [testSessionId, leagueId, seasonId]);
        if (!session.rows[0]) return null;
      }
      const requestedIds = [...new Set([activeRoundId, latestRoundId].filter(Boolean))];
      const rounds = await client.query(`SELECT fr.id,fr.round_id FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id=fr.round_id
        WHERE fr.id=ANY($1::uuid[]) AND fr.fantasy_season_id=$2::uuid AND r.league_id=$3::uuid`, [requestedIds, seasonId, leagueId]);
      if (rounds.rows.length !== requestedIds.length) return null;
      const lineupRows = await client.query(`SELECT l.fantasy_round_id,
        to_jsonb(l) || jsonb_build_object(
          'fantasy_lineup_players',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.slot_index) FROM public.fantasy_lineup_players p WHERE p.lineup_id=l.id),'[]'::jsonb),
          'fantasy_lineup_reserves',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.fantasy_lineup_reserves r WHERE r.lineup_id=l.id),'[]'::jsonb)) AS value
        FROM public.fantasy_lineups l WHERE l.fantasy_round_id=ANY($1::uuid[]) AND l.user_id=$2::uuid`, [requestedIds, userId]);
      const byRound = new Map(lineupRows.rows.map((row: any) => [row.fantasy_round_id, row.value]));
      const testLineup = testSessionId ? await client.query(`SELECT to_jsonb(l) || jsonb_build_object(
        'fantasy_test_lineup_players',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.slot_index)
          FROM public.fantasy_test_lineup_players p WHERE p.lineup_id=l.id),'[]'::jsonb)) AS value
        FROM public.fantasy_test_lineups l WHERE l.test_session_id=$1::uuid AND l.user_id=$2::uuid LIMIT 1`, [testSessionId, userId]) : { rows: [] };
      const portfolio = !testSessionId ? await client.query(`SELECT to_jsonb(p) || jsonb_build_object('fantasy_portfolio_players',
        COALESCE((SELECT jsonb_agg(to_jsonb(item)) FROM public.fantasy_portfolio_players item WHERE item.portfolio_id=p.id),'[]'::jsonb)) AS value
        FROM public.fantasy_portfolios p WHERE p.fantasy_season_id=$1::uuid AND p.user_id=$2::uuid LIMIT 1`, [seasonId, userId]) : { rows: [] };
      const account = await client.query("SELECT to_jsonb(a) AS value FROM public.fantasy_accounts a WHERE a.fantasy_season_id=$1::uuid AND a.user_id=$2::uuid LIMIT 1", [seasonId, userId]);
      const latestRound = rounds.rows.find((row: any) => row.id === latestRoundId);
      const card = latestRound ? await client.query(`SELECT jsonb_build_object('result_bonus',a.result_bonus) AS value
        FROM public.fantasy_card_activations a WHERE a.round_id=$1::uuid AND a.user_id=$2::uuid LIMIT 1`, [latestRound.round_id, userId]) : { rows: [] };
      return { seasonId, lineup: testSessionId ? testLineup.rows[0]?.value ?? null : activeRoundId ? byRound.get(activeRoundId) ?? null : null,
        latestLineup: latestRoundId ? byRound.get(latestRoundId) ?? null : null,
        portfolio: testSessionId ? null : portfolio.rows[0]?.value ?? null, account: account.rows[0]?.value ?? null,
        latestCardActivation: card.rows[0]?.value ?? null };
    }, userId);
  }

  async getDashboard(leagueId: string, userId: string): Promise<FantasyMarketDashboardData> {
    return this.withClient(async (client) => {
      const leagueRes = await client.query(
        `SELECT feature_tier FROM public.leagues WHERE id = $1 LIMIT 1`,
        [leagueId]
      );
      const isComplete = leagueRes.rows[0]?.feature_tier === "complete";
      if (!isComplete) {
        return {
          authenticated: true,
          available: false,
          budget: 0,
          spent: 0,
          balance: 0,
          marketOpen: false,
          players: [],
          lineup: null,
          confirmedCount: 0,
          totalPlayersCount: 0,
        };
      }

      // Configs de orçamento
      const settingsRes = await client.query(
        `SELECT initial_budget FROM public.fantasy_settings WHERE league_id = $1 LIMIT 1`,
        [leagueId]
      );
      const initialBudget = Number(settingsRes.rows[0]?.initial_budget ?? 100);

      // Rodada atual / mais recente
      const roundRes = await client.query(
        `SELECT id, number, status, market_status, market_closes_at
         FROM public.rounds
         WHERE league_id = $1
         ORDER BY number DESC LIMIT 1`,
        [leagueId]
      );

      const round = roundRes.rows[0];
      const roundId = round?.id ?? null;
      const roundNumber = round?.number ?? null;
      const isMarketOpen = round?.market_status === "open" || round?.status === "draft";
      const marketClosesAt = round?.market_closes_at ?? null;

      // Escalação salva do usuário
      let lineup = null;
      let spent = 0;
      if (roundId) {
        const lineupRes = await client.query(
          `SELECT fl.id, fl.user_id, fr.round_id, fl.captain_player_id, fl.lineup_cost, fl.total_points
           FROM public.fantasy_lineups fl
           JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
           WHERE fr.round_id = $1 AND fl.user_id = $2 LIMIT 1`,
          [roundId, userId]
        );
        if (lineupRes.rows.length > 0) {
          const row = lineupRes.rows[0];
          spent = Number(row.lineup_cost ?? 0);

          const playersRes = await client.query(
            `SELECT flp.slot_role, flp.player_id,
                    COALESCE(flp.player_name_locked, p.name, 'Atleta') as player_name,
                    COALESCE(flp.total_points, 0) as score
             FROM public.fantasy_lineup_players flp
             LEFT JOIN public.players p ON p.id = flp.player_id
             WHERE flp.lineup_id = $1
             ORDER BY flp.slot_index ASC NULLS LAST`,
            [row.id]
          );

          const slots: FantasyLineupSlot[] = playersRes.rows.map((s: any) => ({
            slotRole: s.slot_role ?? "ATA",
            playerId: s.player_id,
            playerName: s.player_name ?? "Atleta",
            score: Number(s.score ?? 0),
            isCaptain: s.player_id === row.captain_player_id,
          }));

          lineup = {
            id: row.id,
            userId: row.user_id,
            roundId: row.round_id,
            leagueId,
            captainPlayerId: row.captain_player_id,
            slots,
            totalCost: spent,
            score: row.total_points ? Number(row.total_points) : null,
          };
        }
      }

      // Jogadores ativos da liga
      const playersRes = await client.query(
        `SELECT p.id, p.name, p.avatar_url as "avatarUrl", p.player_profile as profile,
                p.is_goalkeeper as "isGoalkeeper",
                5.0 as price,
                70 as overall
         FROM public.players p
         WHERE p.is_selectable = true
         ORDER BY p.name ASC`,
        []
      );

      const players: FantasyMarketPlayerSummary[] = playersRes.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        avatarUrl: row.avatarUrl,
        profile: row.profile,
        isGoalkeeper: Boolean(row.isGoalkeeper),
        isGoodGoalkeeper: Boolean(row.isGoalkeeper && Number(row.overall) >= 70),
        price: Number(row.price),
        totalPoints: 0,
        roundsPlayed: 0,
        averagePoints: 0,
        lastRoundPoints: null,
        status: "provavel",
        trend: "flat",
      }));

      // Contagem de confirmados
      let confirmedCount = 0;
      if (roundId) {
        const confRes = await client.query(
          `SELECT COUNT(*)::int as count
           FROM public.fantasy_lineups fl
           JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
           WHERE fr.round_id = $1`,
          [roundId]
        );
        confirmedCount = confRes.rows[0]?.count ?? 0;
      }

      const budget = initialBudget;
      const balance = Math.round((budget - spent) * 100) / 100;

      return {
        authenticated: true,
        available: true,
        roundId,
        roundNumber,
        marketOpen: isMarketOpen,
        marketClosesAt,
        budget,
        spent,
        balance,
        players,
        lineup,
        confirmedCount,
        totalPlayersCount: players.length,
      };
    });
  }

  async getPlayerDetail(
    leagueId: string,
    playerId: string,
    fantasyRoundId?: string
  ): Promise<FantasyPlayerPerformanceDetail | null> {
    return this.withClient(async (client) => {
      const pRes = await client.query(
        `SELECT id, name, avatar_url as "avatarUrl", player_profile as profile, 5.0 as price
         FROM public.players
         WHERE id = $1 LIMIT 1`,
        [playerId]
      );
      if (pRes.rows.length === 0) return null;
      const p = pRes.rows[0];

      const statsRes = await client.query(
        `SELECT s.round_id, r.number as round_number, s.points, s.goals, s.assists, s.clean_sheets
         FROM public.player_round_stats s
         JOIN public.rounds r ON r.id = s.round_id
         WHERE s.player_id = $1 AND r.league_id = $2
         ORDER BY r.number DESC LIMIT 5`,
        [playerId, leagueId]
      );

      let totalPoints = 0;
      let totalGoals = 0;
      let totalAssists = 0;
      let totalCleanSheets = 0;

      const recentRounds = statsRes.rows.map((row: any) => {
        const score = Number(row.points ?? 0);
        totalPoints += score;
        totalGoals += Number(row.goals ?? 0);
        totalAssists += Number(row.assists ?? 0);
        totalCleanSheets += Number(row.clean_sheets ?? 0);

        return {
          roundId: row.round_id,
          roundNumber: Number(row.round_number),
          score,
          priceVariation: 0,
        };
      });

      const matchesPlayed = statsRes.rows.length;
      const averagePoints =
        matchesPlayed > 0 ? Math.round((totalPoints / matchesPlayed) * 100) / 100 : 0;

      return {
        playerId: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        profile: p.profile,
        price: Number(p.price),
        averagePoints,
        totalPoints: Math.round(totalPoints * 100) / 100,
        matchesPlayed,
        goals: totalGoals,
        assists: totalAssists,
        cleanSheets: totalCleanSheets,
        formLevel: averagePoints >= 6 ? "hot" : averagePoints >= 3 ? "warm" : "cold",
        recentRounds,
      };
    });
  }

  async getQuickHighlights(leagueId: string, userId: string): Promise<FantasyMarketQuickHighlights> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `WITH latest AS (
           SELECT h.fantasy_round_id, h.fantasy_season_id
           FROM public.fantasy_player_price_history h
           JOIN public.fantasy_seasons fs ON fs.id=h.fantasy_season_id
           JOIN public.seasons s ON s.id=fs.season_id
           WHERE fs.league_id=$1::uuid AND s.status='active' AND public.is_league_member($1::uuid)
           ORDER BY h.created_at DESC LIMIT 1
         )
         SELECT p.name, p.avatar_url, h.round_points, h.variation_rate, h.price_after-h.price_before AS price_change
         FROM latest JOIN public.fantasy_player_price_history h
           ON h.fantasy_round_id=latest.fantasy_round_id AND h.fantasy_season_id=latest.fantasy_season_id
         JOIN public.players p ON p.id=h.player_id`, [leagueId]
      );
      if (!rows.length) return null;
      const values = rows.map((row: any) => ({ name: row.name || "Jogador", avatarUrl: row.avatar_url || null,
        points: Number(row.round_points || 0), variation: Number(row.variation_rate || 0), priceChange: Number(row.price_change || 0) }));
      const topScorer = [...values].sort((a, b) => b.points - a.points)[0];
      const topGain = [...values].sort((a, b) => b.variation - a.variation)[0];
      const topDrop = [...values].sort((a, b) => a.variation - b.variation)[0];
      return {
        topScorer: topScorer.points > 0 ? topScorer : null,
        topGain: topGain.variation > 0 ? topGain : null,
        topDrop: topDrop.variation < 0 ? topDrop : null,
      };
    }, userId);
  }

  async getMySummary(leagueId: string, userId: string): Promise<FantasyUserSummary | null> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT COALESCE(SUM(fl.total_points), 0) as total_points, COUNT(*) as lineups_count
         FROM public.fantasy_lineups fl
         JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
         JOIN public.rounds r ON r.id = fr.round_id
         WHERE r.league_id = $1 AND fl.user_id = $2`,
        [leagueId, userId]
      );

      const totalPoints = Math.round(Number(rows[0]?.total_points ?? 0) * 100) / 100;
      const lineupsCount = Number(rows[0]?.lineups_count ?? 0);

      return {
        userId,
        totalPoints,
        seasonRank: 1,
        patrimony: 100,
        lineupsCount,
      };
    });
  }

  async getMyHistory(leagueId: string, userId: string): Promise<MyFantasyHistoryRow[]> {
    return this.withClient(async (client) => {
      const { rows } = await client.query(
        `SELECT fl.id, fl.status, fl.total_points::float8 AS total_points,
                fl.budget_before::float8 AS budget_before, fl.budget_after::float8 AS budget_after,
                fl.created_at,
                json_build_object('round_id', fr.round_id, 'market_status', fr.market_status,
                  'fantasy_season_id', fr.fantasy_season_id,
                  'rounds', json_build_object('number', r.number, 'date', r.date)) AS fantasy_rounds
         FROM public.fantasy_lineups fl
         JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
         JOIN public.rounds r ON r.id = fr.round_id
         JOIN public.fantasy_seasons fs ON fs.id = fr.fantasy_season_id
         JOIN public.seasons s ON s.id = fs.season_id
         WHERE r.league_id = $1 AND fs.league_id = $1 AND s.status = 'active'
           AND fl.user_id = $2 AND public.is_league_member($1::uuid)
         ORDER BY fl.created_at DESC`,
        [leagueId, userId]
      );
      return rows;
    }, userId);
  }

  async getLiveMatchSnapshots(leagueId: string, roundId: string, userId: string): Promise<any[] | null> {
    return this.withClient(async (client) => {
      const allowed = await client.query(`SELECT 1 FROM public.rounds r
        WHERE r.id=$1::uuid AND r.league_id=$2::uuid AND public.is_league_member(r.league_id)`, [roundId, leagueId]);
      if (!allowed.rowCount) return null;
      const { rows } = await client.query(`SELECT m.id, m.status, m.team_a_id, m.team_b_id, m.score_a, m.score_b,
        m.duration_seconds, m.timer_started_at, m.timer_accumulated_seconds, m.eligibility_elapsed_offset_seconds,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id',s.player_id,'team_id',s.team_id,
          'entered_elapsed_seconds',s.entered_elapsed_seconds,'left_elapsed_seconds',s.left_elapsed_seconds,'selected_at',s.selected_at)
          ORDER BY s.selected_at) FROM public.match_goalkeeper_stints s WHERE s.match_id=m.id),'[]'::jsonb) AS match_goalkeeper_stints,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('match_id',e.match_id,'event_type',e.event_type,'player_id',e.player_id,
          'assist_player_id',e.assist_player_id,'team_id',e.team_id,'is_own_goal',e.is_own_goal,
          'goalkeeper_a_player_id',e.goalkeeper_a_player_id,'goalkeeper_b_player_id',e.goalkeeper_b_player_id)
          ORDER BY e.created_at, e.id) FROM public.match_events e WHERE e.match_id=m.id AND e.event_type='goal'),'[]'::jsonb) AS match_events,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('match_id',p.match_id,'player_id',p.player_id,'team_id',p.team_id,
          'result_eligible',p.result_eligible,'scoring_eligible',p.scoring_eligible)) FROM public.match_players p WHERE p.match_id=m.id),'[]'::jsonb) AS match_players,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('match_id',g.match_id,'player_id',g.player_id,'team_id',g.team_id))
          FROM public.match_goalkeepers g WHERE g.match_id=m.id),'[]'::jsonb) AS match_goalkeepers
        FROM public.matches m WHERE m.round_id=$1::uuid ORDER BY m.created_at, m.id`, [roundId]);
      return rows;
    }, userId);
  }

  async getLiveProjectionInputs(leagueId: string, roundId: string, userId: string): Promise<{ settings: any; lineups: any[]; players: any[] } | null> {
    return this.withClient(async (client) => {
      const round = await client.query(`SELECT fr.id FROM public.fantasy_rounds fr
        JOIN public.rounds r ON r.id=fr.round_id
        JOIN public.fantasy_seasons fs ON fs.id=fr.fantasy_season_id
        JOIN public.seasons s ON s.id=fs.season_id
        WHERE r.id=$1::uuid AND r.league_id=$2::uuid AND fs.league_id=$2::uuid
          AND s.status='active' AND public.is_league_member(r.league_id)
          AND (fr.market_status IN ('in_progress','finished') OR r.status='finished')`, [roundId, leagueId]);
      if (!round.rows[0]) return null;
      const settings = await client.query("SELECT to_jsonb(s) AS value FROM public.fantasy_settings s WHERE s.league_id=$1::uuid", [leagueId]);
      const lineups = await client.query(`SELECT l.id, l.user_id, l.status, l.score_breakdown, l.captain_player_id,
        l.top_scorer_player_id, l.top_assist_player_id,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id',p.player_id,'slot_role',p.slot_role,
          'player_profile_locked',p.player_profile_locked) ORDER BY p.slot_index)
          FROM public.fantasy_lineup_players p WHERE p.lineup_id=l.id),'[]'::jsonb) AS fantasy_lineup_players,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id',r.player_id,'slot_role',r.slot_role))
          FROM public.fantasy_lineup_reserves r WHERE r.lineup_id=l.id),'[]'::jsonb) AS fantasy_lineup_reserves
        FROM public.fantasy_lineups l WHERE l.fantasy_round_id=$1::uuid`, [round.rows[0].id]);
      const players = await client.query(`SELECT lm.player_id, lm.player_profile,
        jsonb_build_object('id',p.id,'member_category',p.member_category,'is_selectable',p.is_selectable) AS players
        FROM public.league_members lm JOIN public.players p ON p.id=lm.player_id
        WHERE lm.league_id=$1::uuid AND lm.is_active`, [leagueId]);
      return { settings: settings.rows[0]?.value ?? null, lineups: lineups.rows, players: players.rows };
    }, userId);
  }

  async getRevealedInputs(leagueId: string, roundId: string, userId: string): Promise<{ lineups: any[]; players: any[]; reserves: any[]; prices: any[]; profiles: any[]; predictions: any[]; activations: any[] } | null> {
    return this.withClient(async (client) => {
      const round = await client.query(`SELECT fr.id FROM public.fantasy_rounds fr
        JOIN public.rounds r ON r.id=fr.round_id JOIN public.fantasy_seasons fs ON fs.id=fr.fantasy_season_id
        JOIN public.seasons s ON s.id=fs.season_id
        WHERE r.id=$1::uuid AND r.league_id=$2::uuid AND fs.league_id=$2::uuid AND s.status='active'
          AND public.is_league_member(r.league_id)
          AND (fr.market_status IN ('in_progress','finished') OR r.status='finished')`, [roundId, leagueId]);
      if (!round.rows[0]) return null;
      const fantasyRoundId = round.rows[0].id;
      const lineups = await client.query(`SELECT id,user_id,status,captain_player_id,top_scorer_player_id,
        top_assist_player_id,challenge_player_id,player_points::float8,prediction_points::float8,total_points::float8,
        budget_before::float8,budget_after::float8,round_position,score_breakdown
        FROM public.fantasy_lineups WHERE fantasy_round_id=$1::uuid`, [fantasyRoundId]);
      const lineupIds = lineups.rows.map((row: any) => row.id);
      const userIds = lineups.rows.map((row: any) => row.user_id);
      const predictedIds = lineups.rows.flatMap((row: any) => [row.top_scorer_player_id, row.top_assist_player_id, row.challenge_player_id]).filter(Boolean);
      const players = await client.query(`SELECT id,lineup_id,player_id,slot_index,slot_role,player_profile_locked,price_locked,
        price_after,base_points,position_bonus,captain_bonus,total_points,player_name_locked,avatar_url_locked
        FROM public.fantasy_lineup_players WHERE lineup_id=ANY($1::uuid[])`, [lineupIds]);
      const reserves = await client.query(`SELECT id,lineup_id,player_id,slot_role,price_locked,price_after,base_points,applied,
        replaced_player_id,replaced_player_points,points_gain,player_name_locked,avatar_url_locked
        FROM public.fantasy_lineup_reserves WHERE lineup_id=ANY($1::uuid[])`, [lineupIds]);
      const prices = await client.query(`SELECT player_id,price_before,price_after,price_change FROM public.fantasy_player_price_history
        WHERE fantasy_round_id=$1::uuid AND player_id=ANY($2::uuid[])`, [fantasyRoundId, players.rows.map((row: any) => row.player_id)]);
      const profiles = await client.query(`SELECT ap.user_id, CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('name',p.name,'avatar_url',p.avatar_url) END AS players
        FROM public.account_profiles ap LEFT JOIN public.players p ON p.id=ap.player_id WHERE ap.user_id=ANY($1::uuid[])`, [userIds]);
      const predictions = await client.query("SELECT id,name,avatar_url FROM public.players WHERE id=ANY($1::uuid[])", [predictedIds]);
      const activations = await client.query(`SELECT a.user_id,a.status,a.result_bonus,a.result_details,
        jsonb_build_object('name',c.name,'slug',c.slug,'rarity',c.rarity) AS card
        FROM public.fantasy_card_activations a JOIN public.fantasy_cards c ON c.id=a.card_id
        WHERE a.round_id=$1::uuid AND a.user_id=ANY($2::uuid[])`, [roundId, userIds]);
      return { lineups: lineups.rows, players: players.rows, reserves: reserves.rows, prices: prices.rows,
        profiles: profiles.rows, predictions: predictions.rows, activations: activations.rows };
    }, userId);
  }

  async getRevealedLineups(
    leagueId: string,
    userId: string,
    roundId?: string
  ): Promise<{ allowed: boolean; error?: string; lineups: any[] }> {
    return this.withClient(async (client) => {
      const roundRes = await client.query(
        `SELECT fr.id, fr.round_id, fr.market_status, r.status, r.number, r.date FROM public.fantasy_rounds fr
         JOIN public.rounds r ON r.id=fr.round_id
         JOIN public.fantasy_seasons fs ON fs.id=fr.fantasy_season_id
         JOIN public.seasons s ON s.id=fs.season_id
         WHERE r.league_id=$1::uuid AND fs.league_id=$1::uuid AND s.status='active'
           AND public.is_league_member($1::uuid) AND ($2::uuid IS NULL OR r.id=$2::uuid)
         ORDER BY CASE WHEN fr.market_status IN ('open','in_progress') AND r.status <> 'finished' THEN 0 ELSE 1 END,
           r.date DESC, r.number DESC LIMIT 1`,
        [leagueId, !roundId || roundId === "active" ? null : roundId]
      );
      if (roundRes.rows.length === 0) {
        return { allowed: false, error: "Rodada não encontrada.", lineups: [] };
      }

      const r = roundRes.rows[0];
      const isMarketClosed = r.market_status === "in_progress" || r.market_status === "finished" || r.status === "finished";

      if (!isMarketClosed) {
        return {
          allowed: false,
          isMarketOpen: true,
          error: "As escalações só podem ser visualizadas após o fechamento do mercado.",
          lineups: [],
        };
      }

      const { rows } = await client.query(
        `SELECT fl.id, fl.user_id, fl.captain_player_id, fl.total_points AS score, fl.player_points, fl.prediction_points, fl.round_position,
                COALESCE(p.name, 'Cartoleiro') AS user_name, p.avatar_url AS user_avatar,
                (SELECT jsonb_build_object('id', prediction.id, 'name', prediction.name) FROM public.players prediction WHERE prediction.id=fl.top_scorer_player_id) AS top_scorer,
                (SELECT jsonb_build_object('id', prediction.id, 'name', prediction.name) FROM public.players prediction WHERE prediction.id=fl.top_assist_player_id) AS top_assist,
                (SELECT jsonb_build_object('id', prediction.id, 'name', prediction.name) FROM public.players prediction WHERE prediction.id=fl.challenge_player_id) AS challenge_player,
                (SELECT jsonb_build_object('name',card.name,'slug',card.slug,'rarity',card.rarity,'status',activation.status,
                  'bonus',activation.result_bonus,'details',activation.result_details,'fallbackBonus',COALESCE(fl.score_breakdown->'cardBonus','0'::jsonb))
                  FROM public.fantasy_card_activations activation JOIN public.fantasy_cards card ON card.id=activation.card_id
                  WHERE activation.round_id=$2::uuid AND activation.user_id=fl.user_id LIMIT 1) AS active_card,
                (SELECT jsonb_build_object('playerId', reserve.player_id, 'name', COALESCE(reserve.player_name_locked,'Reserva'),
                  'avatarUrl', reserve.avatar_url_locked, 'slotRole', reserve.slot_role, 'basePoints', reserve.base_points,
                  'applied', reserve.applied, 'replacedPlayerId', reserve.replaced_player_id, 'pointsGain', reserve.points_gain)
                  FROM public.fantasy_lineup_reserves reserve WHERE reserve.lineup_id=fl.id LIMIT 1) AS reserve,
                COALESCE((SELECT jsonb_agg(jsonb_build_object('playerId',lp.player_id,'name',COALESCE(lp.player_name_locked,'Jogador'),
                  'avatarUrl',lp.avatar_url_locked,'slotRole',lp.slot_role,'isCaptain',lp.player_id=fl.captain_player_id,
                  'priceLocked',lp.price_locked,'priceAfter',COALESCE(ph.price_after,lp.price_after),
                  'priceChange',COALESCE(ph.price_change,lp.price_after-lp.price_locked),'basePoints',lp.base_points,
                  'positionBonus',lp.position_bonus,'captainBonus',lp.captain_bonus,'points',lp.total_points)
                  ORDER BY lp.slot_index) FROM public.fantasy_lineup_players lp
                  LEFT JOIN public.fantasy_player_price_history ph ON ph.fantasy_round_id=fl.fantasy_round_id AND ph.player_id=lp.player_id
                  WHERE lp.lineup_id=fl.id),'[]'::jsonb) AS players
         FROM public.fantasy_lineups fl
         LEFT JOIN public.account_profiles ap ON ap.user_id=fl.user_id
         LEFT JOIN public.players p ON p.id=ap.player_id
         WHERE fl.fantasy_round_id=$1::uuid AND EXISTS (SELECT 1 FROM public.fantasy_lineup_players lp WHERE lp.lineup_id=fl.id)
         ORDER BY fl.total_points DESC`,
        [r.id, r.round_id]
      );

      return {
        allowed: true,
        isMarketOpen: false,
        roundNumber: r.number,
        roundDate: r.date,
        lineups: rows.map((row: any) => ({
          lineupId: row.id,
          userId: row.user_id,
          isCurrentUser: row.user_id === userId,
          userName: row.user_name,
          userAvatarUrl: row.user_avatar,
          captainId: row.captain_player_id,
          players: row.players,
          ...revealedLineupScore(row.players, row.reserve, row.active_card),
          predictionPoints: Number(row.prediction_points ?? 0),
          position: row.round_position ?? null,
          topScorer: row.top_scorer ?? null,
          topAssist: row.top_assist ?? null,
          challengePlayer: row.challenge_player ?? null,
          reserve: row.reserve ?? null,
          activeCard: row.active_card ?? null,
        })).sort((a: any, b: any) => b.totalPoints - a.totalPoints),
      };
    }, userId);
  }

  async getRoundLineupOverview(leagueId: string, roundId?: string): Promise<FantasyRoundOverview> {
    return this.withClient(async (client) => {
      if (!roundId) {
        return {
          roundId: "",
          isRoundOpen: false,
          confirmedCount: 0,
          revealedLineupsCount: 0,
        };
      }

      const rRes = await client.query(
        `SELECT status, market_status FROM public.rounds WHERE id = $1 AND league_id = $2 LIMIT 1`,
        [roundId, leagueId]
      );
      const isMarketOpen = rRes.rows[0]?.market_status === "open";

      const countRes = await client.query(
        `SELECT COUNT(*)::int as count
         FROM public.fantasy_lineups fl
         JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
         WHERE fr.round_id = $1`,
        [roundId]
      );
      const confirmedCount = countRes.rows[0]?.count ?? 0;

      return {
        roundId,
        isRoundOpen: isMarketOpen,
        confirmedCount,
        revealedLineupsCount: isMarketOpen ? 0 : confirmedCount,
      };
    });
  }

  async saveLineup(params: {
    leagueId: string;
    roundId: string;
    userId: string;
    input: FantasyLineupSubmission;
  }): Promise<{ success: boolean; error?: string; lineupId?: string; confirmed?: boolean }> {
    try {
      return await this.withClient(async (client) => {
        const { rows } = await client.query(`SELECT l.players_per_team, COALESCE(fr.settings_snapshot, ts.settings_snapshot) AS settings_snapshot,
          EXISTS (SELECT 1 FROM public.fantasy_test_sessions ts WHERE ts.round_id=r.id AND ts.league_id=r.league_id) AS is_test
          FROM public.rounds r JOIN public.leagues l ON l.id=r.league_id
          LEFT JOIN public.fantasy_rounds fr ON fr.round_id=r.id
          LEFT JOIN public.fantasy_test_sessions ts ON ts.round_id=r.id AND ts.league_id=r.league_id
          WHERE r.id=$1::uuid AND r.league_id=$2::uuid AND public.is_league_member(r.league_id)
            AND (fr.id IS NOT NULL OR EXISTS (SELECT 1 FROM public.fantasy_test_sessions ts WHERE ts.round_id=r.id AND ts.league_id=r.league_id))
          FOR UPDATE OF r`, [params.roundId, params.leagueId]);
        const round = rows[0];
        if (!round) return { success: false, error: "Rodada do Cartola não encontrada nesta pelada." };
        const input = params.input;
        const size = Number(round.settings_snapshot?.players_per_team ?? round.players_per_team ?? 5);
        if (!Number.isInteger(size) || input.playerIds.length !== size || !input.captainId || new Set(input.playerIds).size !== size) return { success: false, error: `Escolha exatamente ${size} jogadores diferentes e um capitão.` };
        const slots = input.slotAssignments;
        if (slots.length !== size || new Set(slots.map((slot) => slot.playerId)).size !== size || new Set(slots.map((slot) => slot.slotIndex)).size !== size || slots.some((slot) => !input.playerIds.includes(slot.playerId) || !Number.isInteger(slot.slotIndex) || slot.slotIndex < 0 || !["GOL", "DEF", "ATA"].includes(slot.slotRole))) return { success: false, error: "As posições da escalação são inválidas." };
        if (Boolean(input.reservePlayerId) !== Boolean(input.reserveRole) || (input.reserveRole && !["GOL", "DEF", "ATA"].includes(input.reserveRole)) || (input.reservePlayerId && input.playerIds.includes(input.reservePlayerId))) return { success: false, error: "Banco de reserva inválido." };
        if (round.is_test && input.reservePlayerId) return { success: false, error: "O banco de reserva ainda não está disponível na rodada de testes." };
        const dbSlots = slots.map((slot) => ({ player_id: slot.playerId, slot_index: slot.slotIndex, slot_role: slot.slotRole }));
        const args = [params.roundId, input.playerIds, input.captainId, input.scorerId || null, input.assistId || null, input.challengeId || null, JSON.stringify(dbSlots)];
        const sql = round.is_test
          ? "SELECT public.save_fantasy_test_lineup($1::uuid,$2::uuid[],$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::jsonb) AS id"
          : "SELECT public.save_fantasy_lineup_with_reserve($1::uuid,$2::uuid[],$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::jsonb,$8::uuid,$9::text) AS id";
        const saved = await client.query(sql, round.is_test ? args : [...args, input.reservePlayerId || null, input.reserveRole || null]);
        const id = saved.rows[0]?.id;
        if (!id) throw new Error("O banco não confirmou a escalação.");
        return { success: true, confirmed: true, lineupId: id };
      }, params.userId);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async previewMarketV11(leagueId: string, userId: string): Promise<{ success: boolean; preview?: unknown; error?: string }> {
    try {
      return await this.withClient(async (client) => {
        const season = await client.query(`SELECT fs.id FROM public.fantasy_seasons fs
          JOIN public.seasons s ON s.id=fs.season_id
          WHERE fs.league_id=$1::uuid AND s.league_id=$1::uuid AND s.status='active'
            AND public.is_league_admin($1::uuid) LIMIT 1`, [leagueId]);
        if (!season.rows[0]) return { success: false, error: "O Cartola desta pelada ainda não foi iniciado ou acesso não autorizado." };
        const result = await client.query("SELECT public.preview_fantasy_market_v11($1::uuid) AS preview", [season.rows[0].id]);
        return { success: true, preview: result.rows[0]?.preview ?? null };
      }, userId);
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async repairLegacyLineups(leagueId: string): Promise<{ success: boolean; repairedCount: number }> {
    void leagueId;
    throw new Error("O reparo modular de escalações ainda não está disponível.");
  }
}
