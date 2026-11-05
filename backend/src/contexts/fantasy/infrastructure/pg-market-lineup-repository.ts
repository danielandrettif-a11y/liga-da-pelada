import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { FantasyMarketLineupRepository } from "../application/manage-market-lineup.js";
import type { FantasyRankingReadModel } from "../domain/analytical-read-models.js";
import { resolveFantasyFinishedPlayerScores } from "../domain/lineup-player-total.js";
import type {
  FantasyMarketDashboardData,
  FantasyMarketPlayerSummary,
  FantasyMarketQuickHighlights,
  FantasyPlayerPerformanceDetail,
  FantasyRoundOverview,
  FantasyUserSummary,
  UserFantasyHistoryEntry,
} from "../domain/market-lineup.js";
import { buildFantasyPlayerPerformanceDetail, type FantasyPlayerHistoryItem } from "../domain/player-detail.js";
import { buildFantasyDashboardAnalytics } from "../domain/dashboard.js";
import { DEFAULT_FANTASY_SETTINGS, normalizeFantasySettingsRow } from "../domain/config.js";
import { calculateFantasyGoalkeeperSlotPoints } from "../domain/engine.js";
import { readLiveFantasyProjection } from "./pg-live-fantasy-projection.js";

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
      const leagueResult = await client.query<any>(
        `SELECT league.feature_tier,league.players_per_team,public.is_league_admin($1::uuid) is_admin
         FROM public.leagues league WHERE league.id=$1::uuid AND public.is_league_member(league.id)`, [leagueId]);
      const league = leagueResult.rows[0];
      if (league?.feature_tier !== "complete") return {
        authenticated: true, available: false, unavailableReason: "basic",
        budget: 0, spent: 0, balance: 0, marketOpen: false, players: [], lineup: null,
        confirmedCount: 0, totalPlayersCount: 0,
      };
      const seasonResult = await client.query<any>(
        `SELECT season.id season_id,fantasy_season.id fantasy_season_id,fantasy_season.initial_budget,
                fantasy_season.initial_player_price
         FROM public.seasons season
         LEFT JOIN public.fantasy_seasons fantasy_season ON fantasy_season.season_id=season.id
         WHERE season.league_id=$1::uuid AND season.status='active'
         ORDER BY season.created_at DESC LIMIT 1`, [leagueId]);
      const season = seasonResult.rows[0];
      if (!season) return { authenticated: true, available: false, unavailableReason: "no-season",
        budget: 0, spent: 0, balance: 0, marketOpen: false, players: [], lineup: null,
        confirmedCount: 0, totalPlayersCount: 0 };
      if (!season.fantasy_season_id) return { authenticated: true, available: false, migrationRequired: true,
        budget: 0, spent: 0, balance: 0, marketOpen: false, players: [], lineup: null,
        confirmedCount: 0, totalPlayersCount: 0 };

      const [roundsResult, testSessionResult, settingsResult, accountResult, playersResult, statsResult, historyResult,
        lineupsResult, testLineupsResult, portfolioResult, packsResult, inventoryResult, healthResult] = await Promise.all([
        client.query<any>(
          `SELECT fantasy_round.*,round_item.number,round_item.date,round_item.start_time,round_item.status,
                  round_item.round_type,round_item.suppress_goalkeeper_rewards,
                  EXISTS(SELECT 1 FROM public.matches match_item WHERE match_item.round_id=round_item.id
                    AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live','finished'))) has_started,
                  NOT EXISTS(SELECT 1 FROM public.round_players participant WHERE participant.round_id=round_item.id
                    AND NOT EXISTS(SELECT 1 FROM public.round_payments payment WHERE payment.round_id=round_item.id
                      AND payment.player_id=participant.player_id AND payment.paid)) participants_paid
           FROM public.fantasy_rounds fantasy_round JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
           WHERE fantasy_round.fantasy_season_id=$1::uuid AND round_item.round_type='official'
           ORDER BY round_item.date DESC,round_item.number DESC`, [season.fantasy_season_id]),
        client.query<any>(
          `SELECT session.*,round_item.number,round_item.date,round_item.start_time,round_item.status round_status,
                  round_item.suppress_goalkeeper_rewards
           FROM public.fantasy_test_sessions session JOIN public.rounds round_item ON round_item.id=session.round_id
           WHERE session.league_id=$1::uuid AND session.season_id=$2::uuid
             AND session.status IN ('open','in_progress') ORDER BY session.created_at DESC LIMIT 1`, [leagueId,season.season_id]),
        client.query<any>("SELECT * FROM public.fantasy_settings WHERE league_id=$1::uuid LIMIT 1", [leagueId]),
        client.query<any>("SELECT * FROM public.fantasy_accounts WHERE fantasy_season_id=$1::uuid AND user_id=$2::uuid LIMIT 1",
          [season.fantasy_season_id, userId]),
        client.query<any>(
          `SELECT player.id,player.name,player.avatar_url,player.is_goalkeeper,member.player_profile profile,
                  COALESCE(price.current_price,$3::numeric) current_price,COALESCE(price.total_points,0) total_points,
                  COALESCE(price.rounds_played,0) rounds_played,
                  CASE WHEN loadout.user_id IS NULL THEN NULL ELSE jsonb_build_object('frameKey',frame.asset_key,
                    'auraKey',aura.asset_key,'backgroundAssetKey',background.asset_key) END cosmetics
           FROM public.league_members member JOIN public.players player ON player.id=member.player_id
           LEFT JOIN public.fantasy_player_prices price ON price.player_id=player.id AND price.fantasy_season_id=$2::uuid
           LEFT JOIN public.account_profiles profile ON profile.player_id=player.id
           LEFT JOIN public.account_cosmetic_loadouts loadout ON loadout.user_id=profile.user_id
           LEFT JOIN public.fantasy_cosmetics frame ON frame.id=loadout.frame_cosmetic_id
           LEFT JOIN public.fantasy_cosmetics aura ON aura.id=loadout.aura_cosmetic_id
           LEFT JOIN public.fantasy_cosmetics background ON background.id=loadout.background_cosmetic_id
           WHERE member.league_id=$1::uuid AND member.is_active AND player.member_category='player'
             AND player.is_selectable IS NOT FALSE ORDER BY player.name`,
          [leagueId, season.fantasy_season_id, season.initial_player_price || 10]),
        client.query<any>(
          `SELECT stats.* FROM public.player_round_stats stats JOIN public.rounds round_item ON round_item.id=stats.round_id
           WHERE round_item.season_id=$1::uuid AND round_item.league_id=$2::uuid`, [season.season_id, leagueId]),
        client.query<any>(
          `SELECT history.*,fantasy_round.round_id FROM public.fantasy_player_price_history history
           JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=history.fantasy_round_id
           WHERE history.fantasy_season_id=$1::uuid ORDER BY history.created_at`, [season.fantasy_season_id]),
        client.query<any>(
          `SELECT lineup.id,lineup.user_id,lineup.fantasy_round_id,lineup.captain_player_id,
                  lineup.top_scorer_player_id,lineup.top_assist_player_id,lineup.challenge_player_id,
                  lineup.lineup_cost,lineup.total_points,lineup.player_points,lineup.locked_at,lineup.status,
                  lineup.score_breakdown,lineup.budget_after,
                  COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.slot_index)
                    FILTER(WHERE item.id IS NOT NULL),'[]'::jsonb) players,
                  COALESCE((SELECT jsonb_agg(to_jsonb(reserve)) FROM public.fantasy_lineup_reserves reserve
                    WHERE reserve.lineup_id=lineup.id),'[]'::jsonb) reserves
           FROM public.fantasy_lineups lineup LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id=lineup.id
           JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
           WHERE fantasy_round.fantasy_season_id=$1::uuid
           GROUP BY lineup.id`, [season.fantasy_season_id]),
        client.query<any>(
          `SELECT lineup.*,COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.slot_index)
                    FILTER(WHERE item.id IS NOT NULL),'[]'::jsonb) players,'[]'::jsonb reserves
           FROM public.fantasy_test_lineups lineup
           JOIN public.fantasy_test_sessions session ON session.id=lineup.test_session_id
           LEFT JOIN public.fantasy_test_lineup_players item ON item.lineup_id=lineup.id
           WHERE session.league_id=$1::uuid AND session.season_id=$2::uuid GROUP BY lineup.id`, [leagueId,season.season_id]),
        client.query<any>(
          `SELECT portfolio.*,COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.slot_index)
             FILTER(WHERE item.id IS NOT NULL),'[]'::jsonb) fantasy_portfolio_players
           FROM public.fantasy_portfolios portfolio LEFT JOIN public.fantasy_portfolio_players item ON item.portfolio_id=portfolio.id
           WHERE portfolio.fantasy_season_id=$1::uuid AND portfolio.user_id=$2::uuid GROUP BY portfolio.id`,
          [season.fantasy_season_id, userId]),
        client.query<any>(
          `SELECT pack.*,round_item.number round_number,
                  COALESCE(jsonb_agg(jsonb_build_object('slot',offer.slot,'card',to_jsonb(card)))
                    FILTER(WHERE offer.id IS NOT NULL),'[]'::jsonb) offers
           FROM public.fantasy_round_packs pack LEFT JOIN public.rounds round_item ON round_item.id=pack.round_id
           LEFT JOIN public.fantasy_pack_offers offer ON offer.pack_id=pack.id
           LEFT JOIN public.fantasy_cards card ON card.id=offer.card_id
           WHERE pack.user_id=$1::uuid AND (round_item.league_id=$2::uuid OR round_item.id IS NULL)
           GROUP BY pack.id,round_item.number ORDER BY pack.created_at DESC`, [userId, leagueId]),
        client.query<any>(
          `SELECT count(*)::int count FROM public.fantasy_user_cards
           WHERE user_id=$1::uuid AND league_id=$2::uuid AND status='OWNED'`, [userId, leagueId]),
        client.query<any>("SELECT public.get_fantasy_market_v11_public_health($1::uuid) data", [season.fantasy_season_id]),
      ]);
      const rounds = roundsResult.rows;
      if (!rounds.length) return { authenticated: true, available: false, unavailableReason: "no-round",
        budget: 0, spent: 0, balance: 0, marketOpen: false, players: [], lineup: null,
        confirmedCount: 0, totalPlayersCount: playersResult.rows.length };
      const testSession = testSessionResult.rows[0] || null;
      const activeOfficialRound = rounds.find((item: any) => item.status !== "finished"
        && ["open", "in_progress"].includes(item.market_status)) || null;
      if (activeOfficialRound?.market_status === "open" && activeOfficialRound.has_started) {
        activeOfficialRound.market_status = "in_progress";
      }
      const activeRound = testSession ? { ...testSession, market_status:testSession.status,
        status:testSession.round_status, is_test:true } : activeOfficialRound;
      const finishedRounds = rounds.filter((item: any) => item.market_status === "finished");
      const latestFinished = finishedRounds[0] || null;
      const displayRound = activeRound || latestFinished;
      const previousRound = activeRound ? latestFinished : finishedRounds[1] || null;
      const settings = normalizeFantasySettingsRow(settingsResult.rows[0] || null);
      const projection = displayRound ? await readLiveFantasyProjection(client, {
        leagueId, fantasySeasonId: season.fantasy_season_id, targetRoundId: displayRound.round_id,
      }) : null;
      const scoringSettings = projection?.settings || { ...settings,
        scoringVersion: Number(displayRound?.settings_snapshot?.scoring_version ?? displayRound?.scoring_version
          ?? settings.scoringVersion), suppressGoalkeeperRewards: Boolean(displayRound?.suppress_goalkeeper_rewards) };
      const lineupsForRound = testSession
        ? testLineupsResult.rows.filter((item:any)=>item.test_session_id===testSession.id)
          .map((item:any)=>({...item,fantasy_round_id:testSession.id}))
        : lineupsResult.rows.filter((item: any) => item.fantasy_round_id === displayRound?.id);
      const previousLineups = lineupsResult.rows.filter((item: any) => item.fantasy_round_id === previousRound?.id);
      const historyByPlayer = new Map<string, any[]>();
      for (const item of historyResult.rows) historyByPlayer.set(item.player_id,
        [...(historyByPlayer.get(item.player_id) || []), item]);
      const statsByPlayer = new Map<string, any[]>();
      for (const item of statsResult.rows) statsByPlayer.set(item.player_id,
        [...(statsByPlayer.get(item.player_id) || []), item]);
      const sumStats = (rows: any[]) => rows.reduce((total, item) => {
        for (const [source, target] of [["goals","goals"],["assists","assists"],["wins","wins"],["losses","losses"],
          ["games","games"],["goalkeeper_games","goalkeeperGames"],["goalkeeper_goals","goalkeeperGoals"],
          ["goalkeeper_assists","goalkeeperAssists"],["goalkeeper_own_goals","goalkeeperOwnGoals"],
          ["goalkeeper_wins","goalkeeperWins"],["goalkeeper_draws","goalkeeperDraws"],
          ["goalkeeper_losses","goalkeeperLosses"],["goals_conceded","goalsConceded"],
          ["clean_sheets","cleanSheets"],["team_goals_conceded","teamGoalsConceded"]] as const) {
          total[target] = Number(total[target] || 0) + Number(item[source] || 0);
        }
        return total;
      }, {} as Record<string, number>);
      const analytics = buildFantasyDashboardAnalytics({
        players: playersResult.rows.map((player: any) => {
          const seasonStats = sumStats(statsByPlayer.get(player.id) || []);
          seasonStats.goalkeeperPoints = calculateFantasyGoalkeeperSlotPoints(seasonStats, scoringSettings);
          const roundStats = projection?.statsByPlayer.get(player.id) || null;
          const roundGoalkeeperPoints = roundStats ? calculateFantasyGoalkeeperSlotPoints(roundStats, scoringSettings) : 0;
          return { id:player.id,name:player.name,avatarUrl:player.avatar_url,profile:player.profile,
            isGoalkeeper:Boolean(player.is_goalkeeper),price:Number(player.current_price||0),
            totalPoints:Number(player.total_points||0),roundsPlayed:Number(player.rounds_played||0),stats:seasonStats,
            history:(historyByPlayer.get(player.id)||[]).map((item:any)=>({points:Number(item.round_points||0),
              variation:Number(item.variation_rate||0),priceChange:Number(item.price_change||0)})),
            roundStats:roundStats?{...roundStats,goalkeeperPoints:roundGoalkeeperPoints}:null,
            cosmetics:player.cosmetics||null,isInCurrentRound:Boolean(roundStats) };
        }),
        currentLineups: lineupsForRound.map((item:any)=>({userId:item.user_id,
          playerIds:item.players.map((player:any)=>player.player_id),captainPlayerId:item.captain_player_id,
          topScorerPlayerId:item.top_scorer_player_id,topAssistPlayerId:item.top_assist_player_id})),
        previousLineups: previousLineups.map((item:any)=>({userId:item.user_id,
          playerIds:item.players.map((player:any)=>player.player_id)})), minSample:Number(settings.minSampleForRadar||3),
      });
      const ownedLineup = lineupsForRound.find((item:any) => item.user_id === userId) || null;
      const portfolio = portfolioResult.rows[0] || null;
      const effectiveLineup = ownedLineup ? { ...ownedLineup, fantasy_lineup_players:ownedLineup.players,
        fantasy_lineup_reserves:ownedLineup.reserves } : !activeRound && portfolio ? portfolio : null;
      const account = accountResult.rows[0] || {};
      const initialBudget = Number(season.initial_budget || DEFAULT_FANTASY_SETTINGS.initialBudget);
      const budget = Math.max(Number(account.current_budget ?? initialBudget), initialBudget);
      const spent = Number(ownedLineup?.lineup_cost || 0);
      const currentProjection = projection?.byUserId.get(userId) || null;
      const latestLineup = latestFinished
        ? lineupsResult.rows.find((item:any)=>item.fantasy_round_id===latestFinished.id&&item.user_id===userId) : null;
      const latestPlayerScores = latestLineup?.players?.map((item:any)=>({playerId:item.player_id,
        points:Number(item.total_points||0)})) || [];
      const activeCardResult = displayRound ? await client.query<any>(
        `SELECT activation.*,to_jsonb(card) card FROM public.fantasy_card_activations activation
         JOIN public.fantasy_cards card ON card.id=activation.card_id
         WHERE activation.round_id=$1::uuid AND activation.user_id=$2::uuid LIMIT 1`, [displayRound.round_id,userId]) : {rows:[]};
      const availablePacks = packsResult.rows.filter((item:any)=>item.status!=="claimed");
      return {
        authenticated:true,available:true,isAdmin:Boolean(league.is_admin),settings:scoringSettings,
        playersPerTeam:Number(displayRound?.settings_snapshot?.players_per_team||league.players_per_team||5),
        round:displayRound?{id:displayRound.round_id,number:Number(displayRound.number),date:displayRound.date,
          start_time:displayRound.start_time,status:displayRound.status}:null,
        fantasySeasonId:season.fantasy_season_id,
        fantasyRound:{id:activeRound?.id||null,status:activeRound?activeRound.market_status:"between_rounds",
          lockedAt:activeRound?.locked_at||null,isTest:Boolean(testSession),betweenRounds:!activeRound,
          challengeType:activeRound?.challenge_type||null,rulesVersion:Number(activeRound?.rules_version||0),
          scoringVersion:Number(scoringSettings.scoringVersion||0)},
        latestFinishedRoundPaid:Boolean(latestFinished?.participants_paid),market:analytics.market,lineup:effectiveLineup,
        insights:analytics.insights,radar:analytics.radar,marketHealth:healthResult.rows[0]?.data||null,
        budget,account:{totalPoints:Number(account.total_points||0),roundsPlayed:Number(account.rounds_played||0),
          bestRoundPoints:Number(account.best_round_points||0)},
        lastRound:latestFinished?{roundId:latestFinished.round_id,userId,number:Number(latestFinished.number),
          date:latestFinished.date,playerPoints:latestPlayerScores.reduce((sum:number,item:any)=>sum+item.points,0),
          cardPoints:Number(latestLineup?.score_breakdown?.cardBonus||0),totalPoints:Number(latestLineup?.total_points||0),
          playerScores:latestPlayerScores}:null,
        activeCard:activeCardResult.rows[0]||null,availablePacks,availablePacksCount:availablePacks.length,
        inventoryCount:Number(inventoryResult.rows[0]?.count||0),
        liveProjection:{isLive:Boolean(projection?.isLive),calculatedAt:new Date().toISOString(),
          playerPoints:[...(projection?.statsByPlayer.values()||[])].map((item:any)=>({playerId:item.playerId,points:item.basePoints})),
          playerStats:[...(projection?.statsByPlayer.values()||[])],currentUser:currentProjection},
        roundId:displayRound?.round_id||null,roundNumber:displayRound?.number==null?null:Number(displayRound.number),
        marketOpen:activeRound?.market_status==="open",marketClosesAt:null,spent,
        balance:Math.round((budget-spent)*100)/100,
        players:analytics.market as unknown as FantasyMarketPlayerSummary[],
        confirmedCount:lineupsForRound.length,totalPlayersCount:analytics.market.length,
      };
    });
  }

  async getPlayerDetail(leagueId: string, playerId: string, userId: string, fantasyRoundId?: string): Promise<FantasyPlayerPerformanceDetail | null> {
    return this.withUser(userId, async (client) => {
      const player = await client.query<any>(
        `SELECT player.id, player.name, player.avatar_url, player.member_category, player.is_goalkeeper,
                member.player_profile profile, fantasy_season.id fantasy_season_id,
                COALESCE(price.current_price,fantasy_season.initial_player_price) current_price,
                COALESCE(price.total_points,0) total_points,COALESCE(price.rounds_played,0) rounds_played
         FROM public.league_members member JOIN public.players player ON player.id = member.player_id
         JOIN public.seasons season ON season.league_id = member.league_id AND season.status = 'active'
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.season_id = season.id
         LEFT JOIN public.fantasy_player_prices price ON price.player_id = player.id AND price.fantasy_season_id = fantasy_season.id
         WHERE member.league_id = $1::uuid AND member.player_id = $2::uuid AND member.is_active = true`, [leagueId, playerId]);
      const row = player.rows[0];
      if (!row) return null;
      const [historyResult, statsResult, cosmeticsResult] = await Promise.all([
        client.query<any>(
        `SELECT history.id,history.fantasy_round_id,round_item.id round_id,round_item.number round_number,
                round_item.date round_date,history.price_before,history.price_after,history.variation_rate,
                COALESCE(history.price_change,history.price_after-history.price_before) price_change,
                history.market_band,history.round_rank,history.round_percentile,history.round_points,
                history.goals,history.assists,history.wins,history.games,history.created_at
         FROM public.fantasy_player_price_history history
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id = history.fantasy_season_id
         JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = history.fantasy_round_id
         JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
         WHERE fantasy_season.id=$1::uuid AND history.player_id=$2::uuid
         ORDER BY round_item.date,round_item.number,history.created_at`, [row.fantasy_season_id, playerId]),
        client.query<any>(
          `SELECT stats.* FROM public.player_round_stats stats
           JOIN public.rounds round_item ON round_item.id=stats.round_id
           WHERE round_item.season_id=(SELECT season_id FROM public.fantasy_seasons WHERE id=$1::uuid)
             AND round_item.league_id=$2::uuid AND stats.player_id=$3::uuid`,
          [row.fantasy_season_id, leagueId, playerId]),
        client.query<any>(
          `SELECT banner.asset_key banner_asset_key,frame.asset_key frame_asset_key
           FROM public.account_profiles profile
           LEFT JOIN public.account_cosmetic_loadouts loadout ON loadout.user_id=profile.user_id
           LEFT JOIN public.fantasy_cosmetics banner ON banner.id=loadout.banner_cosmetic_id
           LEFT JOIN public.fantasy_cosmetics frame ON frame.id=loadout.frame_cosmetic_id
           WHERE profile.player_id=$1::uuid LIMIT 1`, [playerId]),
      ]);
      const history: FantasyPlayerHistoryItem[] = historyResult.rows.map((item: any) => ({
        id: item.id, fantasyRoundId: item.fantasy_round_id, roundNumber: item.round_number == null ? null : Number(item.round_number),
        roundDate: item.round_date || null, priceBefore: Number(item.price_before || 0), priceAfter: Number(item.price_after || 0),
        variationRate: Number(item.variation_rate || 0), priceChange: Number(item.price_change || 0),
        marketBand: item.market_band || "STABLE", roundRank: item.round_rank == null ? null : Number(item.round_rank),
        roundPercentile: item.round_percentile == null ? null : Number(item.round_percentile),
        roundPoints: Number(item.round_points || 0), goals: Number(item.goals || 0), assists: Number(item.assists || 0),
        wins: Number(item.wins || 0), games: Number(item.games || 0), createdAt: item.created_at,
      }));
      let roundResult = await client.query<any>(
        `SELECT fantasy_round.id,fantasy_round.round_id,fantasy_round.market_status,round_item.status,
                round_item.number,round_item.date
         FROM public.fantasy_rounds fantasy_round JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
         WHERE fantasy_round.fantasy_season_id=$1::uuid
           AND (($2::uuid IS NOT NULL AND fantasy_round.id=$2::uuid)
             OR ($2::uuid IS NULL AND round_item.status<>'finished' AND fantasy_round.market_status IN ('open','in_progress')))
         ORDER BY round_item.date DESC,round_item.number DESC LIMIT 1`, [row.fantasy_season_id, fantasyRoundId || null]);
      if (!roundResult.rows[0] && !fantasyRoundId && history.at(-1)?.fantasyRoundId) {
        roundResult = await client.query<any>(
          `SELECT fantasy_round.id,fantasy_round.round_id,fantasy_round.market_status,round_item.status,
                  round_item.number,round_item.date
           FROM public.fantasy_rounds fantasy_round JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
           WHERE fantasy_round.id=$1::uuid LIMIT 1`, [history.at(-1)!.fantasyRoundId]);
      }
      const selectedRound = roundResult.rows[0] || null;
      let roundDetail = null;
      if (selectedRound) {
        const [projection, lineupResult, officialResult] = await Promise.all([
          readLiveFantasyProjection(client, { leagueId, fantasySeasonId: row.fantasy_season_id,
            targetRoundId: selectedRound.round_id }),
          client.query<any>(
            `SELECT lineup.captain_player_id,item.slot_role,item.base_points,item.position_bonus,
                    item.captain_bonus,item.total_points
             FROM public.fantasy_lineups lineup
             LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id=lineup.id AND item.player_id=$3::uuid
             WHERE lineup.fantasy_round_id=$1::uuid AND lineup.user_id=$2::uuid LIMIT 1`,
            [selectedRound.id, userId, playerId]),
          client.query<any>("SELECT * FROM public.player_round_stats WHERE round_id=$1::uuid AND player_id=$2::uuid LIMIT 1",
            [selectedRound.round_id, playerId]),
        ]);
        if (projection) {
          const lineup = lineupResult.rows[0] || null;
          const projectedStats: any = projection.statsByPlayer.get(playerId) || { playerId, playerProfile: row.profile,
            games: 0,goals: 0,assists: 0,wins: 0,draws: 0,losses: 0,ownGoals: 0,goalkeeperGames: 0,
            goalkeeperGoals: 0,goalkeeperAssists: 0,goalkeeperOwnGoals: 0,goalkeeperWins: 0,goalkeeperDraws: 0,
            goalkeeperLosses: 0,goalsConceded: 0,cleanSheets: 0,defensiveCleanGames: 0,defensiveOneGoalGames: 0,
            teamGoalsConceded: 0,basePoints: 0 };
          const official = officialResult.rows[0];
          const finished = selectedRound.market_status === "finished" || selectedRound.status === "finished";
          const current: any = finished && official ? { ...projectedStats, goals:Number(official.goals||0),assists:Number(official.assists||0),
            wins:Number(official.wins||0),draws:Number(official.draws||0),losses:Number(official.losses||0),ownGoals:Number(official.own_goals||0),
            goalkeeperGames:Number(official.goalkeeper_games||0),goalkeeperGoals:Number(official.goalkeeper_goals||0),
            goalkeeperAssists:Number(official.goalkeeper_assists||0),goalkeeperOwnGoals:Number(official.goalkeeper_own_goals||0),
            goalkeeperWins:Number(official.goalkeeper_wins||0),goalkeeperDraws:Number(official.goalkeeper_draws||0),
            goalkeeperLosses:Number(official.goalkeeper_losses||0),goalsConceded:Number(official.goals_conceded||0),
            cleanSheets:Number(official.clean_sheets||0),defensiveCleanGames:Number(official.ranking_defensive_clean_games??official.defensive_clean_games??0),
            defensiveOneGoalGames:Number(official.ranking_defensive_one_goal_games??official.defensive_one_goal_games??0),
            teamGoalsConceded:Number(official.team_goals_conceded||0),playerProfile:official.player_profile_locked||row.profile }
            : projectedStats;
          current.recentPoints=[]; current.seasonPoints=[];
          const projectedPlayer = projection.byUserId.get(userId)?.players.find((item) => item.playerId === playerId);
          const useStoredGoalkeeper = finished && lineup?.slot_role === "GOL";
          const basePoints = useStoredGoalkeeper ? Number(lineup.base_points||0) : Number(projectedPlayer?.basePoints??current.basePoints??0);
          const positionBonus = useStoredGoalkeeper ? Number(lineup.position_bonus||0) : Number(projectedPlayer?.positionBonus??lineup?.position_bonus??0);
          const captainBonus = useStoredGoalkeeper ? Number(lineup.captain_bonus||0) : Number(projectedPlayer?.captainBonus??lineup?.captain_bonus??0);
          roundDetail = { fantasyRoundId:selectedRound.id,roundNumber:Number(selectedRound.number||0),roundDate:selectedRound.date||null,
            status: finished ? "finished" as const : projection.isLive ? "live" as const : "open" as const,
            stats:current,settings:projection.settings,slotRole:lineup?.slot_role||null,
            isCaptain:lineup?.captain_player_id===playerId,basePoints,positionBonus,captainBonus,
            totalPoints:useStoredGoalkeeper?Number(lineup.total_points||0):Number(projectedPlayer?.totalPoints??basePoints+positionBonus+captainBonus),
            matches:projection.matches };
        }
      }
      const cosmetics = cosmeticsResult.rows[0] || {};
      return buildFantasyPlayerPerformanceDetail({
        player:{id:row.id,name:row.name,avatarUrl:row.avatar_url,profile:row.profile,
          memberCategory:row.member_category,isGoalkeeper:Boolean(row.is_goalkeeper)},
        price:Number(row.current_price||0),totalPoints:Number(row.total_points||0),roundsPlayed:Number(row.rounds_played||0),
        seasonStats:statsResult.rows,history,roundDetail,
        cosmetics:{bannerAssetKey:cosmetics.banner_asset_key||null,frameKey:cosmetics.frame_asset_key||null},
      });
    });
  }

  async getQuickHighlights(leagueId: string, userId: string): Promise<FantasyMarketQuickHighlights | null> {
    return this.withUser(userId, async (client) => {
      const result = await client.query<any>(
        `SELECT player.name,player.avatar_url,price.last_round_points,price.last_price_change,price.variation_rate
         FROM public.fantasy_player_prices price
         JOIN public.fantasy_seasons season ON season.id = price.fantasy_season_id
         JOIN public.seasons core ON core.id=season.season_id AND core.status='active'
         JOIN public.players player ON player.id = price.player_id
         WHERE season.league_id = $1`, [leagueId]);
      if (!result.rows.length) return null;
      const rows = result.rows.map((row: any) => ({ name: row.name || "Jogador", avatarUrl: row.avatar_url || null,
        points: Number(row.last_round_points || 0), priceChange: Number(row.last_price_change || 0),
        variation: Number(row.variation_rate || 0) }));
      const scorer = [...rows].sort((a, b) => b.points - a.points)[0]!;
      const gain = [...rows].sort((a, b) => b.variation - a.variation)[0]!;
      const drop = [...rows].sort((a, b) => a.variation - b.variation)[0]!;
      return { topScorer: scorer.points > 0 ? scorer : null, topGain: gain.variation > 0 ? gain : null,
        topDrop: drop.variation < 0 ? drop : null };
    });
  }

  async getMySummary(leagueId: string, userId: string): Promise<FantasyRankingReadModel | null> {
    return this.withUser(userId, async (client) => {
      const result = await client.query<any>(
        `WITH active_season AS (
           SELECT fantasy_season.id FROM public.fantasy_seasons fantasy_season
           JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
           WHERE fantasy_season.league_id=$1::uuid LIMIT 1
         ), lineup_metrics AS (
           SELECT lineup.user_id,sum(COALESCE(lineup.total_points,0)) total_points,count(*)::int rounds_played,
             max(COALESCE(lineup.total_points,0)) best_round_points
           FROM public.fantasy_lineups lineup JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
           WHERE fantasy_round.fantasy_season_id=(SELECT id FROM active_season) AND lineup.status='scored'
           GROUP BY lineup.user_id
         ), player_metrics AS (
           SELECT lineup.user_id,sum(COALESCE(item.captain_bonus,0)) captain_bonus_points,
             sum(COALESCE(item.total_points,0)) FILTER (WHERE item.slot_role='DEF') def_points,
             sum(COALESCE(item.total_points,0)) FILTER (WHERE item.slot_role IN ('ATA','MEI')) attack_points,
              (count(item.id) FILTER (WHERE item.slot_role IN ('ATA','MEI')))::int attack_selection_count
           FROM public.fantasy_lineups lineup JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
           JOIN public.fantasy_lineup_players item ON item.lineup_id=lineup.id
           WHERE fantasy_round.fantasy_season_id=(SELECT id FROM active_season) AND lineup.status='scored'
           GROUP BY lineup.user_id
         ), ranking AS (
           SELECT account.id,account.user_id,COALESCE(lineup_metrics.total_points,0) total_points,
             COALESCE(lineup_metrics.rounds_played,0) rounds_played,COALESCE(lineup_metrics.best_round_points,0) best_round_points,
             COALESCE(player_metrics.captain_bonus_points,0) captain_bonus_points,
             COALESCE(player_metrics.def_points,0) def_points,0::numeric mid_points,0::int mid_selection_count,
             0::numeric mid_average_points,COALESCE(player_metrics.attack_points,0) attack_points,
             COALESCE(player_metrics.attack_selection_count,0) attack_selection_count,
             COALESCE(player_metrics.attack_points,0)/greatest(1,COALESCE(player_metrics.attack_selection_count,0)) attack_average_points,
             COALESCE(account.current_budget,0) current_budget,false is_live,
             dense_rank() OVER (ORDER BY COALESCE(lineup_metrics.total_points,0) DESC) position
           FROM public.fantasy_accounts account LEFT JOIN lineup_metrics ON lineup_metrics.user_id=account.user_id
           LEFT JOIN player_metrics ON player_metrics.user_id=account.user_id
           WHERE account.fantasy_season_id=(SELECT id FROM active_season)
         )
         SELECT ranking.*,jsonb_build_object('name',player.name,'avatar_url',player.avatar_url) player,
           CASE WHEN loadout.user_id IS NULL THEN NULL ELSE jsonb_build_object(
             'frameKey',frame.asset_key,'auraKey',aura.asset_key,'nameplateKey',nameplate.asset_key,
             'titleName',title.name,'backgroundAssetKey',background.asset_key) END cosmetics,NULL::jsonb "roundCard"
         FROM ranking LEFT JOIN public.account_profiles profile ON profile.user_id=ranking.user_id
         LEFT JOIN public.players player ON player.id=profile.player_id
         LEFT JOIN public.account_cosmetic_loadouts loadout ON loadout.user_id=ranking.user_id
         LEFT JOIN public.fantasy_cosmetics frame ON frame.id=loadout.frame_cosmetic_id
         LEFT JOIN public.fantasy_cosmetics aura ON aura.id=loadout.aura_cosmetic_id
         LEFT JOIN public.fantasy_cosmetics nameplate ON nameplate.id=loadout.nameplate_cosmetic_id
         LEFT JOIN public.fantasy_cosmetics title ON title.id=loadout.title_cosmetic_id
         LEFT JOIN public.fantasy_cosmetics background ON background.id=loadout.background_cosmetic_id
         WHERE ranking.user_id=$2::uuid`, [leagueId, userId]);
      const row = result.rows[0];
      if (!row) return null;
      const season = await client.query<{ id: string }>(
        `SELECT fantasy_season.id FROM public.fantasy_seasons fantasy_season
         JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
         WHERE fantasy_season.league_id=$1::uuid LIMIT 1`, [leagueId]);
      const fantasySeasonId = season.rows[0]?.id;
      const live = fantasySeasonId
        ? await readLiveFantasyProjection(client, { leagueId, fantasySeasonId })
        : null;
      const projection = live?.byUserId.get(userId);
      if (!projection) return row;
      const defPlayers = projection.players.filter((item) => item.slotRole === "DEF");
      const attackPlayers = projection.players.filter((item) => item.slotRole === "ATA");
      const attackSelections = Number(row.attack_selection_count || 0) + attackPlayers.length;
      return {
        ...row,
        total_points: Number(row.total_points || 0) + Number(projection.totalPoints || 0),
        best_round_points: Math.max(Number(row.best_round_points || 0), Number(projection.totalPoints || 0)),
        captain_bonus_points: Number(row.captain_bonus_points || 0) + Number(projection.captainBonus || 0),
        def_points: Number(row.def_points || 0) + defPlayers.reduce((sum, item) => sum + Number(item.totalPoints || 0), 0),
        attack_points: Number(row.attack_points || 0) + attackPlayers.reduce((sum, item) => sum + Number(item.totalPoints || 0), 0),
        attack_selection_count: attackSelections,
        attack_average_points: (Number(row.attack_points || 0)
          + attackPlayers.reduce((sum, item) => sum + Number(item.totalPoints || 0), 0)) / Math.max(1, attackSelections),
        is_live: true,
      };
    });
  }

  async getMyHistory(leagueId: string, userId: string): Promise<unknown[]> {
    return this.withUser(userId, async (client) => {
      const result = await client.query<any>(
        `SELECT lineup.id,lineup.status,lineup.total_points,lineup.budget_before,lineup.budget_after,lineup.created_at,
                jsonb_build_object('round_id',fantasy_round.round_id,'market_status',fantasy_round.market_status,
                  'fantasy_season_id',fantasy_round.fantasy_season_id,'rounds',jsonb_build_object(
                    'number',round_item.number,'date',round_item.date)) fantasy_rounds
         FROM public.fantasy_lineups lineup
         JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=fantasy_round.fantasy_season_id
         JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
         JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
         WHERE fantasy_season.league_id=$1::uuid AND lineup.user_id=$2::uuid
         ORDER BY lineup.created_at DESC`, [leagueId, userId]);
      return result.rows;
    });
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
      const round = await client.query<any>(
        `SELECT fantasy_round.id, fantasy_round.fantasy_season_id, fantasy_round.market_status,round_item.id round_id,
                round_item.number,round_item.date,round_item.status
         FROM public.fantasy_rounds fantasy_round
         JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=fantasy_round.fantasy_season_id
         JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
         WHERE round_item.league_id=$1::uuid AND ($2::uuid IS NULL OR round_item.id=$2::uuid)
         ORDER BY CASE WHEN round_item.status<>'finished' AND fantasy_round.market_status IN ('open','in_progress') THEN 0 ELSE 1 END,
           round_item.date DESC,round_item.number DESC LIMIT 1`, [leagueId, roundId && roundId !== "active" ? roundId : null]);
      if (!round.rows[0]) return { allowed: false, error: "Rodada não encontrada.", lineups: [] };
      const target=round.rows[0];
      if (target.market_status === "open" && target.status !== "finished") return { allowed:false,isMarketOpen:true,
        error:"As escalações só são reveladas após o fechamento do mercado (início da primeira partida).",lineups:[] };
      const lineups = await client.query<any>(
        `SELECT lineup.*,
          jsonb_build_object('name',profile_player.name,'avatar_url',profile_player.avatar_url) profile,
          COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item.slot_index)
            FILTER(WHERE item.id IS NOT NULL),'[]'::jsonb) players,
          COALESCE((SELECT jsonb_agg(to_jsonb(reserve)) FROM public.fantasy_lineup_reserves reserve
            WHERE reserve.lineup_id=lineup.id),'[]'::jsonb) reserves
         FROM public.fantasy_lineups lineup
         LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id=lineup.id
         LEFT JOIN public.account_profiles profile ON profile.user_id=lineup.user_id
         LEFT JOIN public.players profile_player ON profile_player.id=profile.player_id
         WHERE lineup.fantasy_round_id=$1::uuid
         GROUP BY lineup.id,profile_player.id`, [target.id]);
      const usable=lineups.rows.filter((lineup:any)=>lineup.players?.length>0);
      const playerIds=[...new Set(usable.flatMap((item:any)=>item.players.map((player:any)=>player.player_id)))] as string[];
      const predictionIds=[...new Set(usable.flatMap((item:any)=>[item.top_scorer_player_id,item.top_assist_player_id,item.challenge_player_id].filter(Boolean)))] as string[];
      const [prices,predictions,activations]=await Promise.all([
        playerIds.length?client.query<any>(`SELECT player_id,price_before,price_after,price_change FROM public.fantasy_player_price_history
          WHERE fantasy_round_id=$1::uuid AND player_id=ANY($2::uuid[])`,[target.id,playerIds]):Promise.resolve({rows:[]}),
        predictionIds.length?client.query<any>("SELECT id,name,avatar_url FROM public.players WHERE id=ANY($1::uuid[])",[predictionIds]):Promise.resolve({rows:[]}),
        usable.length?client.query<any>(`SELECT activation.user_id,activation.status,activation.result_bonus,activation.result_details,
          card.name,card.slug,card.rarity FROM public.fantasy_card_activations activation
          LEFT JOIN public.fantasy_cards card ON card.id=activation.card_id
          WHERE activation.round_id=$1::uuid AND activation.user_id=ANY($2::uuid[])`,[target.round_id,usable.map((item:any)=>item.user_id)]):Promise.resolve({rows:[]}),
      ]);
      const priceByPlayer=new Map(prices.rows.map((item:any)=>[item.player_id,item]));
      const predictionById=new Map(predictions.rows.map((item:any)=>[item.id,item]));
      const activationByUser=new Map(activations.rows.map((item:any)=>[item.user_id,item]));
      const live = await readLiveFantasyProjection(client, {
        leagueId,
        fantasySeasonId: target.fantasy_season_id,
        targetRoundId: target.round_id,
      });
      const revealed=usable.map((lineup:any)=>{
        const activation:any=activationByUser.get(lineup.user_id),details=activation?.result_details||{};
        const pending=["RESERVED","LOCKED"].includes(String(activation?.status||"").toUpperCase());
        const monetary=Number(details.budgetRecovery||0)>0||Number(details.discountAmount||0)>0||Number(details.discountPercent||0)>0
          ||activation?.slug==="bargain"||activation?.slug==="extra_credit"||Number(details.budgetBonus||0)>0;
        const cardPoints=activation&&!pending&&!monetary?Math.max(Number(activation.result_bonus||0),Number(lineup.score_breakdown?.cardBonus||0)):0;
        const reserve=lineup.reserves?.[0]||null;
        const projection=live?.byUserId.get(lineup.user_id);
        const resolvedScores=projection
          ? live?.isLive
            ? projection.players.map((item)=>({playerId:item.playerId,points:Number(item.totalPoints||0)}))
            : resolveFantasyFinishedPlayerScores({projectedPlayers:projection.players,storedPlayers:lineup.players})
          : lineup.players.map((item:any)=>({playerId:item.player_id,points:Number(item.total_points||0)}));
        const projectedPointsByPlayer=new Map(resolvedScores.map((item:any)=>[item.playerId,item.points]));
        const reservePointsGain=Number(projection?.reserve?.pointsGain??reserve?.points_gain??0);
        const playerPoints=resolvedScores.reduce((total:number,item:any)=>total+item.points,0)+reservePointsGain;
        const named=(id:string|null)=>{const player:any=id?predictionById.get(id):null;return player?{id:player.id,name:player.name}:null;};
        return {lineupId:lineup.id,userId:lineup.user_id,isCurrentUser:lineup.user_id===userId,
          userName:lineup.profile?.name||"Cartoleiro",userAvatarUrl:lineup.profile?.avatar_url||null,
          totalPoints:playerPoints+cardPoints,playerPoints,predictionPoints:Number(lineup.prediction_points||0),
          position:lineup.round_position||null,captainId:lineup.captain_player_id,
          topScorer:named(lineup.top_scorer_player_id),topAssist:named(lineup.top_assist_player_id),challengePlayer:named(lineup.challenge_player_id),
          reserve:reserve?{playerId:reserve.player_id,name:reserve.player_name_locked||"Reserva",avatarUrl:reserve.avatar_url_locked||null,
             slotRole:reserve.slot_role,basePoints:Number(projection?.reserve?.basePoints??(reserve.base_points||0)),
            applied:Boolean(projection?.reserve?.applied??reserve.applied),
            replacedPlayerId:projection?.reserve?.replacedPlayerId??(reserve.replaced_player_id||null),pointsGain:reservePointsGain}:null,
          activeCard:activation?{name:activation.name,slug:activation.slug,rarity:activation.rarity,status:activation.status,
            bonus:Number(activation.result_bonus||0),details,fallbackBonus:Number(lineup.score_breakdown?.cardBonus||0)}:null,
          players:lineup.players.map((item:any)=>{const price:any=priceByPlayer.get(item.player_id);return{playerId:item.player_id,
            name:item.player_name_locked||"Jogador",avatarUrl:item.avatar_url_locked||null,slotRole:item.slot_role||null,
            isCaptain:item.player_id===lineup.captain_player_id,priceLocked:Number(item.price_locked||0),
            priceAfter:price?.price_after!=null?Number(price.price_after):item.price_after!=null?Number(item.price_after):null,
            priceChange:price?.price_change!=null?Number(price.price_change):item.price_after!=null?Number(item.price_after)-Number(item.price_locked||0):null,
            basePoints:Number(item.base_points||0),positionBonus:Number(item.position_bonus||0),captainBonus:Number(item.captain_bonus||0),
             points:projectedPointsByPlayer.get(item.player_id)??Number(item.total_points||0)};})};});
      revealed.sort((a:any,b:any)=>b.totalPoints-a.totalPoints);
      return {allowed:true,isMarketOpen:false,roundNumber:Number(target.number),roundDate:target.date,lineups:revealed};
    });
  }

  async getRoundLineupOverview(leagueId: string, userId: string, roundId?: string): Promise<FantasyRoundOverview> {
    return this.withUser(userId, async (client) => {
      const result = await client.query<any>(
        `SELECT fantasy_round.id,fantasy_round.fantasy_season_id,fantasy_round.market_status,round_item.id round_id,round_item.number,
                round_item.date,round_item.status,
                EXISTS(SELECT 1 FROM public.matches match_item WHERE match_item.round_id=round_item.id
                  AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live','finished'))) has_started
         FROM public.fantasy_rounds fantasy_round JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=fantasy_round.fantasy_season_id
         JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
         WHERE round_item.league_id=$1::uuid AND ($2::uuid IS NULL OR round_item.id=$2::uuid)
         ORDER BY CASE WHEN round_item.status<>'finished' AND fantasy_round.market_status IN ('open','in_progress') THEN 0 ELSE 1 END,
           round_item.date DESC,round_item.number DESC LIMIT 1`, [leagueId,roundId&&roundId!=="active"?roundId:null]);
      const row=result.rows[0];
      const empty: FantasyRoundOverview = {
        isRoundOpen: false,
        confirmedCount: 0,
        pendingCount: 0,
        confirmed: [],
        pending: [],
        ranking: [],
      };
      if(!row)return empty;
      const isRoundOpen=row.market_status==="open"&&!row.has_started&&row.status!=="finished";
      if(!isRoundOpen){
        const rankingRows=await client.query<any>(
          `SELECT lineup.id,lineup.user_id,lineup.total_points,lineup.budget_after current_budget,1 rounds_played,false is_live,
                  lineup.score_breakdown,jsonb_build_object('name',player.name,'avatar_url',player.avatar_url) player,
                  CASE WHEN loadout.user_id IS NULL THEN NULL ELSE jsonb_build_object('frameKey',frame.asset_key,
                    'auraKey',aura.asset_key,'nameplateKey',nameplate.asset_key,'titleName',title.name,
                    'backgroundAssetKey',background.asset_key) END cosmetics,
                  CASE WHEN card.id IS NULL THEN NULL ELSE jsonb_build_object('slug',card.slug,'name',card.name,
                    'rarity',card.rarity,'bonus',COALESCE(activation.result_bonus,0),'budgetRecovery',
                    COALESCE((activation.result_details->>'budgetRecovery')::numeric,0),'description',activation.result_details->>'description',
                    'status',activation.status,'details',COALESCE(activation.result_details,'{}'::jsonb),
                    'fallbackBonus',COALESCE((lineup.score_breakdown->>'cardBonus')::numeric,0)) END "roundCard"
           FROM public.fantasy_lineups lineup
           LEFT JOIN public.account_profiles profile ON profile.user_id=lineup.user_id
           LEFT JOIN public.players player ON player.id=profile.player_id
           LEFT JOIN public.account_cosmetic_loadouts loadout ON loadout.user_id=lineup.user_id
           LEFT JOIN public.fantasy_cosmetics frame ON frame.id=loadout.frame_cosmetic_id
           LEFT JOIN public.fantasy_cosmetics aura ON aura.id=loadout.aura_cosmetic_id
           LEFT JOIN public.fantasy_cosmetics nameplate ON nameplate.id=loadout.nameplate_cosmetic_id
           LEFT JOIN public.fantasy_cosmetics title ON title.id=loadout.title_cosmetic_id
           LEFT JOIN public.fantasy_cosmetics background ON background.id=loadout.background_cosmetic_id
           LEFT JOIN public.fantasy_card_activations activation ON activation.user_id=lineup.user_id AND activation.round_id=$2::uuid
           LEFT JOIN public.fantasy_cards card ON card.id=activation.card_id
           WHERE lineup.fantasy_round_id=$1::uuid`,[row.id,row.round_id]);
        const live = await readLiveFantasyProjection(client, {
          leagueId,
          fantasySeasonId: row.fantasy_season_id,
          targetRoundId: row.round_id,
        });
        const projectionByUser = live?.byUserId || new Map();
        const ordered=rankingRows.rows.map((item:any)=>{
          const projection = projectionByUser.get(item.user_id);
          const card=item.roundCard,details=card?.details||{};
          const pending=["RESERVED","LOCKED"].includes(String(card?.status||"").toUpperCase());
          const monetary=Number(details.budgetRecovery||0)>0||Number(details.discountAmount||0)>0||Number(details.discountPercent||0)>0
            ||card?.slug==="bargain"||card?.slug==="extra_credit"||Number(details.budgetBonus||0)>0;
          const cardPoints=card&&!pending&&!monetary?Math.max(Number(card.bonus||0),Number(card.fallbackBonus||0)):0;
          const projectedPlayerScores = projection && !live?.isLive
            ? resolveFantasyFinishedPlayerScores({
                projectedPlayers: projection.players,
                storedPlayers: live?.storedPlayersByUserId.get(item.user_id),
              })
            : null;
          const fieldPoints = projection
            ? projectedPlayerScores
              ? projectedPlayerScores.reduce((sum, player) => sum + player.points, 0)
              : projection.players.reduce((sum: number, player: any) => sum + Number(player.totalPoints || 0), 0)
            : Number(item.total_points || 0);
          return{...item,total_points:fieldPoints+cardPoints,is_live:Boolean(projection&&live?.isLive)};
        }).sort((a:any,b:any)=>b.total_points-a.total_points);
        let previousPoints:number|null=null,previousPosition=0;
        const ranking=ordered.map((item:any,index:number)=>{const points=Number(item.total_points||0);
          const position=previousPoints===points?previousPosition:index+1;previousPoints=points;previousPosition=position;
          return{...item,position};});
        return{isRoundOpen:false,roundNumber:Number(row.number),roundDate:row.date,roundId:row.round_id,
          confirmedCount:ranking.length,pendingCount:0,confirmed:[],pending:[],ranking};
      }
      const accounts=await client.query<any>(
         `SELECT account.user_id,lineup.created_at saved_at,lineup.status lineup_status,lineup.total_points,
                jsonb_build_object('name',player.name,'avatar_url',player.avatar_url) player,
                CASE WHEN loadout.user_id IS NULL THEN NULL ELSE jsonb_build_object('frameKey',frame.asset_key,
                  'auraKey',aura.asset_key,'backgroundAssetKey',background.asset_key) END cosmetics
         FROM public.fantasy_accounts account
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=account.fantasy_season_id
         LEFT JOIN public.fantasy_lineups lineup ON lineup.user_id=account.user_id AND lineup.fantasy_round_id=$2::uuid
         LEFT JOIN public.account_profiles profile ON profile.user_id=account.user_id
         LEFT JOIN public.players player ON player.id=profile.player_id
         LEFT JOIN public.account_cosmetic_loadouts loadout ON loadout.user_id=account.user_id
         LEFT JOIN public.fantasy_cosmetics frame ON frame.id=loadout.frame_cosmetic_id
         LEFT JOIN public.fantasy_cosmetics aura ON aura.id=loadout.aura_cosmetic_id
         LEFT JOIN public.fantasy_cosmetics background ON background.id=loadout.background_cosmetic_id
         WHERE fantasy_season.league_id=$1::uuid`,[leagueId,row.id]);
      const entries=accounts.rows.map((item:any)=>({userId:item.user_id,playerName:item.player?.name||"Cartoleiro",
        avatarUrl:item.player?.avatar_url||null,hasSaved:Boolean(item.saved_at)&&item.lineup_status!=="missed",
        savedAt:item.lineup_status!=="missed"?item.saved_at||null:null,points:null,
        isCurrentUser:item.user_id===userId,cosmetics:item.cosmetics||null}));
      const confirmed=entries.filter((item:any)=>item.hasSaved),pending=entries.filter((item:any)=>!item.hasSaved);
      return{isRoundOpen:true,roundNumber:Number(row.number),roundDate:row.date,roundId:row.round_id,
        confirmedCount:confirmed.length,pendingCount:pending.length,confirmed,pending,ranking:[]};
    });
  }

  async getMarketRoundInfo(leagueId: string, roundId: string, userId: string) {
    return this.withUser(userId, async (client) => {
      const round = await client.query<any>(
        `SELECT fantasy_round.id, fantasy_round.market_status, fantasy_round.fantasy_season_id,
                COALESCE((fantasy_round.settings_snapshot->>'players_per_team')::integer, league.players_per_team, 5) players_per_team
         FROM public.fantasy_rounds fantasy_round JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
         JOIN public.leagues league ON league.id=round_item.league_id
         WHERE round_item.id = $1 AND round_item.league_id = $2`, [roundId, leagueId]);
      const item = round.rows[0];
      if (!item) return { isMarketOpen: false, playerPrices: new Map<string, number>(), userBudget: 0, playersPerTeam: 5 };
      const [prices, account] = await Promise.all([
        client.query<any>("SELECT player_id,current_price FROM public.fantasy_player_prices WHERE fantasy_season_id=$1", [item.fantasy_season_id]),
        client.query<any>("SELECT current_budget FROM public.fantasy_accounts WHERE fantasy_season_id=$1 AND user_id=$2", [item.fantasy_season_id, userId]),
      ]);
      return { isMarketOpen: item.market_status === "open",
        playerPrices: new Map(prices.rows.map((row: any) => [row.player_id, Number(row.current_price)])),
        userBudget: Number(account.rows[0]?.current_budget || 0), playersPerTeam: Number(item.players_per_team || 5) };
    });
  }

  async saveLineup(params: { leagueId: string; roundId: string; userId: string;
    input: import("../domain/market-lineup.js").FantasyLineupSubmission; totalCost: number }) {
    try {
      return await this.withUser(params.userId, async (client) => {
        const scopedRound = await client.query(
          `SELECT 1 FROM public.rounds round_item
           WHERE round_item.id=$1::uuid AND round_item.league_id=$2::uuid`, [params.roundId, params.leagueId]);
        if (!scopedRound.rowCount) return { success: false, error: "Rodada não encontrada." };
        const slots = params.input.slotAssignments.map((slot) => ({
          player_id: slot.playerId, slot_index: slot.slotIndex, slot_role: slot.slotRole,
        }));
        const testSession = await client.query(
          "SELECT 1 FROM public.fantasy_test_sessions WHERE round_id=$1::uuid", [params.roundId]);
        if (testSession.rowCount && params.input.reservePlayerId) {
          return { success: false, error: "O banco de reserva ainda não está disponível na rodada de testes." };
        }
        const common = [params.roundId, params.input.playerIds, params.input.captainId,
          params.input.scorerId || null, params.input.assistId || null, params.input.challengeId || null,
          JSON.stringify(slots)];
        const result = testSession.rowCount
          ? await client.query<{ id: string }>(
              "SELECT public.save_fantasy_test_lineup($1::uuid,$2::uuid[],$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::jsonb) id", common)
          : await client.query<{ id: string }>(
              "SELECT public.save_fantasy_lineup_with_reserve($1::uuid,$2::uuid[],$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::jsonb,$8::uuid,$9::text) id",
              [...common, params.input.reservePlayerId || null, params.input.reserveRole || null]);
        return result.rows[0]?.id ? { success: true, lineupId: result.rows[0].id }
          : { success: true, error: undefined };
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
        return result.rows[0] ? { success: true, preview: result.rows[0].data }
          : { success: false, error: "O Cartola desta pelada ainda não foi iniciado." };
      });
    } catch (error: any) { return { success: false, error: error.message }; }
  }

  async repairLegacyLineups(leagueId: string, userId: string) {
    const result = await this.withUser(userId, async (client) => client.query<any>(
      `SELECT public.repair_legacy_saved_fantasy_lineups() data WHERE public.is_league_admin($1::uuid)`, [leagueId]));
    return { success: true, repaired: Number(result.rows[0]?.data?.repaired || 0),
      lineups: Array.isArray(result.rows[0]?.data?.lineups) ? result.rows[0].data.lineups : [] };
  }
}
