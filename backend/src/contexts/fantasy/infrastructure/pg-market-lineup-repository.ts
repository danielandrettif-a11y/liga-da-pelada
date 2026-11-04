import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { FantasyMarketLineupRepository } from "../application/manage-market-lineup.js";
import type { FantasyRankingReadModel } from "../domain/analytical-read-models.js";
import type {
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
             count(item.id)::int FILTER (WHERE item.slot_role IN ('ATA','MEI')) attack_selection_count
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
      return row || null;
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
        `SELECT fantasy_round.id, fantasy_round.market_status,round_item.id round_id,
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
      const revealed=usable.map((lineup:any)=>{
        const activation:any=activationByUser.get(lineup.user_id),details=activation?.result_details||{};
        const pending=["RESERVED","LOCKED"].includes(String(activation?.status||"").toUpperCase());
        const monetary=Number(details.budgetRecovery||0)>0||Number(details.discountAmount||0)>0||Number(details.discountPercent||0)>0
          ||activation?.slug==="bargain"||activation?.slug==="extra_credit"||Number(details.budgetBonus||0)>0;
        const cardPoints=activation&&!pending&&!monetary?Math.max(Number(activation.result_bonus||0),Number(lineup.score_breakdown?.cardBonus||0)):0;
        const reserve=lineup.reserves?.[0]||null;
        const playerPoints=lineup.players.reduce((total:number,item:any)=>total+Number(item.total_points||0),0)+Number(reserve?.points_gain||0);
        const named=(id:string|null)=>{const player:any=id?predictionById.get(id):null;return player?{id:player.id,name:player.name}:null;};
        return {lineupId:lineup.id,userId:lineup.user_id,isCurrentUser:lineup.user_id===userId,
          userName:lineup.profile?.name||"Cartoleiro",userAvatarUrl:lineup.profile?.avatar_url||null,
          totalPoints:playerPoints+cardPoints,playerPoints,predictionPoints:Number(lineup.prediction_points||0),
          position:lineup.round_position||null,captainId:lineup.captain_player_id,
          topScorer:named(lineup.top_scorer_player_id),topAssist:named(lineup.top_assist_player_id),challengePlayer:named(lineup.challenge_player_id),
          reserve:reserve?{playerId:reserve.player_id,name:reserve.player_name_locked||"Reserva",avatarUrl:reserve.avatar_url_locked||null,
            slotRole:reserve.slot_role,basePoints:Number(reserve.base_points||0),applied:Boolean(reserve.applied),
            replacedPlayerId:reserve.replaced_player_id||null,pointsGain:Number(reserve.points_gain||0)}:null,
          activeCard:activation?{name:activation.name,slug:activation.slug,rarity:activation.rarity,status:activation.status,
            bonus:Number(activation.result_bonus||0),details,fallbackBonus:Number(lineup.score_breakdown?.cardBonus||0)}:null,
          players:lineup.players.map((item:any)=>{const price:any=priceByPlayer.get(item.player_id);return{playerId:item.player_id,
            name:item.player_name_locked||"Jogador",avatarUrl:item.avatar_url_locked||null,slotRole:item.slot_role||null,
            isCaptain:item.player_id===lineup.captain_player_id,priceLocked:Number(item.price_locked||0),
            priceAfter:price?.price_after!=null?Number(price.price_after):item.price_after!=null?Number(item.price_after):null,
            priceChange:price?.price_change!=null?Number(price.price_change):item.price_after!=null?Number(item.price_after)-Number(item.price_locked||0):null,
            basePoints:Number(item.base_points||0),positionBonus:Number(item.position_bonus||0),captainBonus:Number(item.captain_bonus||0),
            points:Number(item.total_points||0)};})};});
      revealed.sort((a:any,b:any)=>b.totalPoints-a.totalPoints);
      return {allowed:true,isMarketOpen:false,roundNumber:Number(target.number),roundDate:target.date,lineups:revealed};
    });
  }

  async getRoundLineupOverview(leagueId: string, userId: string, roundId?: string): Promise<FantasyRoundOverview> {
    return this.withUser(userId, async (client) => {
      const result = await client.query<any>(
        `SELECT fantasy_round.id,fantasy_round.market_status,round_item.id round_id,round_item.number,
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
        const ordered=rankingRows.rows.map((item:any)=>{const card=item.roundCard,details=card?.details||{};
          const pending=["RESERVED","LOCKED"].includes(String(card?.status||"").toUpperCase());
          const monetary=Number(details.budgetRecovery||0)>0||Number(details.discountAmount||0)>0||Number(details.discountPercent||0)>0
            ||card?.slug==="bargain"||card?.slug==="extra_credit"||Number(details.budgetBonus||0)>0;
          const cardPoints=card&&!pending&&!monetary?Math.max(Number(card.bonus||0),Number(card.fallbackBonus||0)):0;
          return{...item,total_points:Number(item.total_points||0)+cardPoints};}).sort((a:any,b:any)=>b.total_points-a.total_points);
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
