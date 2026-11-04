import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { FantasyAdminRepository } from "../application/manage-fantasy-admin.js";
import type {
  FantasyUserHistoryReadModel,
  FantasyUserRoundHistoryReadModel,
} from "../domain/analytical-read-models.js";
import type { FantasyAdminConfigData, FantasyRankingScope, FantasyUserRoundHistoryDetail, SeasonPassDashboardData } from "../domain/fantasy-admin.js";
import type { RoundStatisticsRepository } from "../../statistics/application/manage-round-statistics.js";
import {
  resolveFantasyBulletinTotal,
  resolveFantasyFinishedPlayerScores,
  resolveFantasyLineupPlayerTotal,
} from "../domain/lineup-player-total.js";
import { readLiveFantasyProjection } from "./pg-live-fantasy-projection.js";

export class PgFantasyAdminRepository implements FantasyAdminRepository {
  constructor(private readonly pool: Pool, private readonly roundStatistics: RoundStatisticsRepository) {}
  private withUser<T>(userId: string, operation: (client: PoolClient) => Promise<T>) {
    return withAuthenticatedTransaction(this.pool, { userId }, operation);
  }

  async isLeagueAdmin(leagueId: string, userId: string) {
    return this.withUser(userId, async (client) => Boolean((await client.query(
      "SELECT 1 WHERE public.is_league_admin($1::uuid)", [leagueId])).rowCount));
  }

  async getRanking(leagueId: string, scope: FantasyRankingScope, actorUserId: string, roundId?: string) {
    return this.withUser(actorUserId, async (client) => {
      const season = await client.query<{ id: string }>(
        `SELECT fantasy_season.id FROM public.fantasy_seasons fantasy_season
         JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
         WHERE fantasy_season.league_id=$1::uuid LIMIT 1`, [leagueId]);
      const fantasySeasonId = season.rows[0]?.id;
      if (!fantasySeasonId) return [];
      const periodScope = scope === "general" ? "season" : scope;
      const rounds = await client.query<any>(
        `SELECT fantasy_round.id,fantasy_round.round_id,fantasy_round.market_status,round_item.date,
                round_item.number,round_item.status
         FROM public.fantasy_rounds fantasy_round JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
         WHERE fantasy_round.fantasy_season_id=$1::uuid ORDER BY round_item.date DESC,round_item.number DESC`, [fantasySeasonId]);
      let selected = rounds.rows;
      if (periodScope === "round") {
        const target = roundId
          ? rounds.rows.find((item: any) => item.round_id === roundId || item.id === roundId)
          : rounds.rows.find((item: any) => item.status !== "finished" && ["open","in_progress"].includes(item.market_status)) || rounds.rows[0];
        selected = target ? [target] : [];
      } else if (periodScope === "month") {
        const latest = rounds.rows.find((item: any) => item.market_status === "finished" || item.market_status === "in_progress" || item.status === "finished");
        const month = String(latest?.date || "").slice(0,7);
        selected = rounds.rows.filter((item: any) => String(item.date || "").startsWith(month));
      }
      const fantasyRoundIds = selected.map((item: any) => item.id);
      if (!fantasyRoundIds.length) return [];
      let live = await readLiveFantasyProjection(client, {
        leagueId,
        fantasySeasonId,
        targetRoundId: periodScope === "round" ? selected[0]?.round_id : undefined,
      });
      if (periodScope === "month" && live && !selected.some((item: any) => item.round_id === live?.roundId)) {
        live = null;
      }
      const result = await client.query<any>(
        `WITH lineup_metrics AS (
           SELECT lineup.user_id,min(lineup.id::text)::uuid id,
             sum(COALESCE(lineup.total_points,0)) total_points,count(*)::int rounds_played,
             max(COALESCE(lineup.total_points,0)) best_round_points,
             max(lineup.budget_after) budget_after,max(lineup.budget_before) budget_before,
             (array_agg(lineup.score_breakdown ORDER BY lineup.created_at DESC))[1] score_breakdown
           FROM public.fantasy_lineups lineup
           WHERE lineup.fantasy_round_id=ANY($1::uuid[])
             AND ($2::text='round' OR lineup.status='scored')
           GROUP BY lineup.user_id
         ), player_metrics AS (
           SELECT lineup.user_id,sum(COALESCE(player.captain_bonus,0)) captain_bonus_points,
             sum(COALESCE(player.total_points,0)) FILTER (WHERE player.slot_role='DEF') def_points,
             sum(COALESCE(player.total_points,0)) FILTER (WHERE player.slot_role IN ('ATA','MEI')) attack_points,
              (count(player.id) FILTER (WHERE player.slot_role IN ('ATA','MEI')))::int attack_selection_count
           FROM public.fantasy_lineups lineup JOIN public.fantasy_lineup_players player ON player.lineup_id=lineup.id
           WHERE lineup.fantasy_round_id=ANY($1::uuid[])
             AND ($2::text='round' OR lineup.status='scored') GROUP BY lineup.user_id
         )
         SELECT account.id,account.user_id,COALESCE(metrics.total_points,0) total_points,
           COALESCE(metrics.rounds_played,0) rounds_played,COALESCE(metrics.best_round_points,0) best_round_points,
           COALESCE(player_metrics.captain_bonus_points,0) captain_bonus_points,COALESCE(player_metrics.def_points,0) def_points,
           0::numeric mid_points,0::int mid_selection_count,0::numeric mid_average_points,
           COALESCE(player_metrics.attack_points,0) attack_points,COALESCE(player_metrics.attack_selection_count,0) attack_selection_count,
           COALESCE(player_metrics.attack_points,0)/greatest(1,COALESCE(player_metrics.attack_selection_count,0)) attack_average_points,
           CASE WHEN $2::text='round' THEN COALESCE(metrics.budget_after,metrics.budget_before,0)
             ELSE COALESCE(account.current_budget,0) END current_budget,
           false is_live,metrics.score_breakdown
         FROM public.fantasy_accounts account
         LEFT JOIN lineup_metrics metrics ON metrics.user_id=account.user_id
         LEFT JOIN player_metrics ON player_metrics.user_id=account.user_id
         WHERE account.fantasy_season_id=$3::uuid`, [fantasyRoundIds, periodScope, fantasySeasonId]);
      let entries = periodScope === "round" ? result.rows.filter((item: any) => Number(item.rounds_played)>0) : result.rows;
      if (periodScope === "round" && live?.roundId === selected[0]?.round_id) {
        const activeLive = live!;
        const byUser = new Map(entries.map((item: any) => [item.user_id, item]));
        for (const projection of activeLive.byUserId.values()) {
          const stored: any = byUser.get(projection.userId) || {};
          const projectedPlayerScores = activeLive.isLive
            ? projection.players.map((player) => ({ playerId: player.playerId, points: Number(player.totalPoints || 0) }))
            : resolveFantasyFinishedPlayerScores({
                projectedPlayers: projection.players,
                storedPlayers: activeLive.storedPlayersByUserId.get(projection.userId),
              });
          const projectedTeamPoints = projectedPlayerScores.reduce((total, player) => total + player.points, 0);
          byUser.set(projection.userId, {
            ...stored,
            id: stored.id || projection.lineupId,
            user_id: projection.userId,
            total_points: projectedTeamPoints,
            rounds_played: 1,
            best_round_points: projectedTeamPoints,
            current_budget: Number(stored.current_budget || 0),
            is_live: activeLive.isLive,
            score_breakdown: stored.score_breakdown || {},
          });
        }
        entries = [...byUser.values()];
      } else if (live) {
        const byUser = new Map(entries.map((item: any) => [item.user_id, item]));
        for (const projection of live.byUserId.values()) {
          const stored: any = byUser.get(projection.userId) || {};
          const defPlayers = projection.players.filter((item) => item.slotRole === "DEF");
          const attackPlayers = projection.players.filter((item) => item.slotRole === "ATA");
          const livePoints = Number(projection.totalPoints || 0);
          byUser.set(projection.userId, {
            ...stored,
            id: stored.id || projection.lineupId,
            user_id: projection.userId,
            total_points: Number(stored.total_points || 0) + livePoints,
            rounds_played: Number(stored.rounds_played || 0),
            best_round_points: Math.max(Number(stored.best_round_points || 0), livePoints),
            captain_bonus_points: Number(stored.captain_bonus_points || 0) + Number(projection.captainBonus || 0),
            def_points: Number(stored.def_points || 0) + defPlayers.reduce((sum, item) => sum + Number(item.totalPoints || 0), 0),
            mid_points: 0,
            mid_selection_count: 0,
            mid_average_points: 0,
            attack_points: Number(stored.attack_points || 0) + attackPlayers.reduce((sum, item) => sum + Number(item.totalPoints || 0), 0),
            attack_selection_count: Number(stored.attack_selection_count || 0) + attackPlayers.length,
            current_budget: Number(stored.current_budget || 0),
            is_live: true,
          });
        }
        entries = [...byUser.values()].map((item: any) => ({
          ...item,
          attack_average_points: Number(item.attack_points || 0) / Math.max(1, Number(item.attack_selection_count || 0)),
        }));
      }
      const userIds = entries.map((item: any) => item.user_id);
      if (!userIds.length) return [];
      const [profiles, cosmetics, activations] = await Promise.all([
        client.query<any>(
          `SELECT profile.user_id,jsonb_build_object('name',player.name,'avatar_url',player.avatar_url) player
           FROM public.account_profiles profile LEFT JOIN public.players player ON player.id=profile.player_id
           WHERE profile.user_id=ANY($1::uuid[])`, [userIds]),
        client.query<any>(
          `SELECT loadout.user_id,frame.asset_key frame_key,aura.asset_key aura_key,
                  nameplate.asset_key nameplate_key,title.name title_name,background.asset_key background_key
           FROM public.account_cosmetic_loadouts loadout
           LEFT JOIN public.fantasy_cosmetics frame ON frame.id=loadout.frame_cosmetic_id
           LEFT JOIN public.fantasy_cosmetics aura ON aura.id=loadout.aura_cosmetic_id
           LEFT JOIN public.fantasy_cosmetics nameplate ON nameplate.id=loadout.nameplate_cosmetic_id
           LEFT JOIN public.fantasy_cosmetics title ON title.id=loadout.title_cosmetic_id
           LEFT JOIN public.fantasy_cosmetics background ON background.id=loadout.background_cosmetic_id
           WHERE loadout.user_id=ANY($1::uuid[])`, [userIds]),
        periodScope === "round" ? client.query<any>(
          `SELECT activation.user_id,activation.status,activation.result_bonus,activation.result_details,
                  card.slug,card.name,card.rarity,card.description
           FROM public.fantasy_card_activations activation
           LEFT JOIN public.fantasy_cards card ON card.id=activation.card_id
           WHERE activation.round_id=$1::uuid AND activation.user_id=ANY($2::uuid[])`, [selected[0].round_id,userIds])
          : Promise.resolve({ rows: [] }),
      ]);
      const profileByUser=new Map(profiles.rows.map((item:any)=>[item.user_id,item.player]));
      const cosmeticsByUser=new Map(cosmetics.rows.map((item:any)=>[item.user_id,{frameKey:item.frame_key||null,auraKey:item.aura_key||null,
        nameplateKey:item.nameplate_key||null,titleName:item.title_name||null,backgroundAssetKey:item.background_key||null}]));
      const cardByUser=new Map(activations.rows.map((item:any)=>[item.user_id,{slug:item.slug||null,name:item.name||"Carta utilizada",
        rarity:item.rarity||"COMMON",bonus:Number(item.result_bonus||0),budgetRecovery:Number(item.result_details?.budgetRecovery||0),
        description:item.result_details?.description||null,status:item.status||"RESERVED",details:item.result_details||{},
        fallbackBonus:Number(entries.find((entry:any)=>entry.user_id===item.user_id)?.score_breakdown?.cardBonus||0)}]));
      const enriched=entries.map((item:any)=>{const card:any=cardByUser.get(item.user_id);const pending=["RESERVED","LOCKED"].includes(String(card?.status||"").toUpperCase());
        const monetary=Number(card?.details?.budgetRecovery||0)>0||Number(card?.details?.discountAmount||0)>0||Number(card?.details?.discountPercent||0)>0
          ||card?.slug==="bargain"||card?.slug==="extra_credit"||Number(card?.details?.budgetBonus||0)>0;
        const cardPoints=card&&!pending&&!monetary?Math.max(Number(card.bonus||0),Number(card.fallbackBonus||0)):0;
        return {...item,total_points:Number(item.total_points||0)+(periodScope==="round"?cardPoints:0),player:profileByUser.get(item.user_id)||null,
          cosmetics:cosmeticsByUser.get(item.user_id)||null,roundCard:card||null};});
      enriched.sort((a:any,b:any)=>Number(b.total_points||0)-Number(a.total_points||0));
      let previous:number|null=null,position=0;
      return enriched.map((item:any,index:number)=>{const points=Number(item.total_points||0);if(previous!==points)position=index+1;previous=points;return{...item,position};});
    });
  }

  async getUserHistory(leagueId: string, userId: string, actorUserId: string): Promise<FantasyUserHistoryReadModel | null> {
    return this.withUser(actorUserId, (client) => this.readUserHistory(client, leagueId, userId));
  }

  async getUserRoundHistory(leagueId: string, userId: string, roundId: string, actorUserId: string): Promise<FantasyUserRoundHistoryReadModel | null> {
    return this.withUser(actorUserId, async (client) => {
      const [history, fantasyRoundResult] = await Promise.all([
        this.readUserHistory(client, leagueId, userId),
        client.query<any>(
          `SELECT fantasy_round.id, fantasy_round.fantasy_season_id, fantasy_round.round_id, fantasy_round.market_status,
                  fantasy_round.scoring_version, fantasy_round.settings_snapshot,
                  jsonb_build_object('number',round_item.number,'date',round_item.date,
                    'status',round_item.status,'suppress_goalkeeper_rewards',round_item.suppress_goalkeeper_rewards,
                    'matches',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',match_item.id,
                      'status',match_item.status,'started_at',match_item.started_at))
                      FROM public.matches match_item WHERE match_item.round_id=round_item.id),'[]'::jsonb)) round
           FROM public.fantasy_rounds fantasy_round
           JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=fantasy_round.fantasy_season_id
           JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
           JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
           WHERE fantasy_season.league_id=$1::uuid AND round_item.id=$2::uuid`, [leagueId, roundId]),
      ]);
      const fantasyRound = fantasyRoundResult.rows[0];
      if (!fantasyRound) return null;
      const lineupResult = await client.query<any>(
        `SELECT lineup.*,
                COALESCE(jsonb_agg(to_jsonb(item) || jsonb_build_object('players',
                  jsonb_build_object('name',player.name,'avatar_url',player.avatar_url))
                  ORDER BY item.created_at) FILTER (WHERE item.id IS NOT NULL),'[]'::jsonb) fantasy_lineup_players
         FROM public.fantasy_lineups lineup
         LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id=lineup.id
         LEFT JOIN public.players player ON player.id=item.player_id
         WHERE lineup.fantasy_round_id=$1::uuid AND lineup.user_id=$2::uuid
         GROUP BY lineup.id`, [fantasyRound.id, userId]);
      const storedLineup = lineupResult.rows[0];
      if (!storedLineup) return null;
      const live = await readLiveFantasyProjection(client, {
        leagueId,
        fantasySeasonId: fantasyRound.fantasy_season_id,
        targetRoundId: roundId,
      });
      const projection = live?.roundId === roundId ? live.byUserId.get(userId) || null : null;
      const playerIds = (storedLineup.fantasy_lineup_players || []).map((item: any) => item.player_id);
      const [stats, prices, predictions, activation] = await Promise.all([
        playerIds.length ? client.query<any>(
          `SELECT player_id,games,goals,assists,wins,draws,losses,own_goals,goalkeeper_games,
                  goalkeeper_goals,goalkeeper_assists,goalkeeper_own_goals,goalkeeper_wins,
                  goalkeeper_draws,goalkeeper_losses,clean_sheets,goals_conceded,
                  defensive_clean_games,defensive_one_goal_games,team_goals_conceded
           FROM public.player_round_stats WHERE round_id=$1::uuid AND player_id=ANY($2::uuid[])`, [roundId, playerIds])
          : Promise.resolve({ rows: [] }),
        playerIds.length ? client.query<any>(
          `SELECT player_id,price_before,price_after,price_change
           FROM public.fantasy_player_price_history
           WHERE fantasy_round_id=$1::uuid AND player_id=ANY($2::uuid[])`, [fantasyRound.id, playerIds])
          : Promise.resolve({ rows: [] }),
        client.query<any>(
          `SELECT id,name,avatar_url FROM public.players
           WHERE id=ANY($1::uuid[])`, [[storedLineup.top_scorer_player_id, storedLineup.top_assist_player_id].filter(Boolean)]),
        client.query<any>(
          `SELECT activation.status,activation.result_bonus,activation.result_details,
                  jsonb_build_object('name',card.name,'slug',card.slug,'rarity',card.rarity,'description',card.description) card
           FROM public.fantasy_card_activations activation
           LEFT JOIN public.fantasy_cards card ON card.id=activation.card_id
           WHERE activation.round_id=$1::uuid AND activation.user_id=$2::uuid`, [roundId, userId]),
      ]);
      const pricesByPlayer = new Map(prices.rows.map((price: any) => [price.player_id, price]));
      const finishedScores = projection && !live?.isLive
        ? resolveFantasyFinishedPlayerScores({
            projectedPlayers: projection.players,
            storedPlayers: storedLineup.fantasy_lineup_players,
          })
        : [];
      const finishedByPlayer = new Map(finishedScores.map((item) => [item.playerId, item.points]));
      const projectedByPlayer = new Map((projection?.players || []).map((item) => [item.playerId, item]));
      const players = (storedLineup.fantasy_lineup_players || []).map((item: any) => {
        const price: any = pricesByPlayer.get(item.player_id);
        const projected = projectedByPlayer.get(item.player_id);
        const useProjection = Boolean(projected && (live?.isLive || item.slot_role !== "GOL"));
        return { ...item,
          base_points: useProjection ? Number(projected?.basePoints || 0) + Number(projected?.positionBonus || 0) : item.base_points,
          position_bonus: useProjection ? Number(projected?.positionBonus || 0) : item.position_bonus,
          captain_bonus: useProjection ? Number(projected?.captainBonus || 0) : item.captain_bonus,
          total_points: useProjection
            ? Number(projected?.totalPoints || 0)
            : (finishedByPlayer.get(item.player_id) ?? item.total_points),
          price_after: price?.price_after ?? item.price_after,
          price_change: price?.price_change ?? (item.price_after == null ? null : Number(item.price_after)-Number(item.price_locked||0)) };
      });
      const playerPoints = projection
        ? players.reduce((total: number, item: any) => total + Number(item.total_points || 0), 0)
          + Number(projection.reserve?.pointsGain || 0)
        : resolveFantasyLineupPlayerTotal({ storedPlayers: players,
            storedPlayerPoints: storedLineup.player_points, storedTotalPoints: storedLineup.total_points });
      const directActivation = activation.rows[0], directCard = directActivation?.card;
      const historyLineup = history?.lineups?.find((item: any) => item.fantasyRound?.round_id === roundId);
      return {
        history: history || { player: null },
        lineup: { ...storedLineup, player_points: playerPoints,
          prediction_points: projection?.predictionPoints ?? storedLineup.prediction_points,
          total_points: projection
            ? resolveFantasyBulletinTotal({ playerPoints, cardPoints: projection.cardPoints })
            : Number(storedLineup.total_points ?? playerPoints),
          score_breakdown: projection ? { ...(storedLineup.score_breakdown || {}),
            captainBonus: projection.captainBonus, positionBonus: projection.positionBonus,
            cardBonus: projection.cardPoints, live: true } : storedLineup.score_breakdown,
          fantasy_lineup_players: players },
        round: fantasyRound.round, isLive: Boolean(projection && live?.isLive),
        scoringVersion: Number(fantasyRound.settings_snapshot?.scoring_version ?? fantasyRound.scoring_version ?? 5),
        settingsSnapshot: fantasyRound.settings_snapshot || {},
        statsByPlayer: projection
          ? Object.fromEntries(playerIds.map((playerId: string) => {
              const stat = live?.statsByPlayer.get(playerId);
              return [playerId, stat ? {
                player_id: playerId, games: stat.games, goals: stat.goals, assists: stat.assists,
                wins: stat.wins, draws: stat.draws, losses: stat.losses, own_goals: stat.ownGoals,
                goalkeeper_games: stat.goalkeeperGames, clean_sheets: stat.cleanSheets,
                goalkeeper_goals: stat.goalkeeperGoals, goalkeeper_assists: stat.goalkeeperAssists,
                goalkeeper_own_goals: stat.goalkeeperOwnGoals, goalkeeper_wins: stat.goalkeeperWins,
                goalkeeper_draws: stat.goalkeeperDraws, goalkeeper_losses: stat.goalkeeperLosses,
                goals_conceded: stat.goalsConceded, defensive_clean_games: stat.defensiveCleanGames,
                defensive_one_goal_games: stat.defensiveOneGoalGames, team_goals_conceded: stat.teamGoalsConceded,
              } : {}];
            }))
          : Object.fromEntries(stats.rows.map((stat: any) => [stat.player_id, stat])),
        predictionPlayers: Object.fromEntries(predictions.rows.map((player: any) => [player.id, player])),
        activeCard: directCard ? { ...directCard, status: directActivation.status,
          bonus: Number(directActivation.result_bonus || 0), details: directActivation.result_details || null }
          : historyLineup?.activeCard || null,
      };
    });
  }

  private async readUserHistory(client: PoolClient, leagueId: string, userId: string): Promise<FantasyUserHistoryReadModel | null> {
    const [profile, account, lineups] = await Promise.all([
      client.query<any>(
        `SELECT profile.user_id,jsonb_build_object('name',player.name,'avatar_url',player.avatar_url) players
         FROM public.account_profiles profile JOIN public.players player ON player.id=profile.player_id
         JOIN public.league_members member ON member.player_id=player.id AND member.league_id=$1::uuid AND member.is_active
         WHERE profile.user_id=$2::uuid LIMIT 1`, [leagueId, userId]),
      client.query<any>(
        `SELECT account.total_points,account.current_budget,account.rounds_played,account.best_round_points
         FROM public.fantasy_accounts account
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=account.fantasy_season_id
         JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
         WHERE fantasy_season.league_id=$1::uuid AND account.user_id=$2::uuid LIMIT 1`, [leagueId, userId]),
      client.query<any>(
        `SELECT lineup.*,
                jsonb_build_object('round_id',fantasy_round.round_id,'market_status',fantasy_round.market_status,
                  'settings_snapshot',fantasy_round.settings_snapshot) fantasy_round,
                jsonb_build_object('number',round_item.number,'date',round_item.date,'status',round_item.status) round
         FROM public.fantasy_lineups lineup
         JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
         JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=fantasy_round.fantasy_season_id
         JOIN public.seasons core ON core.id=fantasy_season.season_id AND core.status='active'
         JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
         WHERE fantasy_season.league_id=$1::uuid AND lineup.user_id=$2::uuid AND lineup.status='scored'
         ORDER BY lineup.created_at DESC`, [leagueId, userId]),
    ]);
    if (!profile.rows[0] || !account.rows[0]) return null;
    const roundIds = lineups.rows.map((lineup: any) => lineup.fantasy_round?.round_id).filter(Boolean);
    const activations = roundIds.length ? await client.query<any>(
      `SELECT activation.round_id,activation.status,activation.result_bonus,activation.result_details,
              jsonb_build_object('name',card.name,'slug',card.slug,'rarity',card.rarity,'description',card.description) card
       FROM public.fantasy_card_activations activation
       LEFT JOIN public.fantasy_cards card ON card.id=activation.card_id
       WHERE activation.user_id=$1::uuid AND activation.round_id=ANY($2::uuid[])`, [userId, roundIds]) : { rows: [] };
    const cardByRound = new Map(activations.rows.map((item: any) => [item.round_id, item]));
    const fantasyAccount = account.rows[0];
    return { userId, player: profile.rows[0].players,
      account: { totalPoints:Number(fantasyAccount.total_points||0), currentBudget:Number(fantasyAccount.current_budget||0),
        roundsPlayed:Number(fantasyAccount.rounds_played||0), bestRoundPoints:Number(fantasyAccount.best_round_points||0) },
      lineups: lineups.rows.map((lineup: any) => { const activation:any=cardByRound.get(lineup.fantasy_round?.round_id);
        return { ...lineup, fantasyRound:lineup.fantasy_round, round:lineup.round,
          activeCard:activation?.card?{...activation.card,status:activation.status,bonus:Number(activation.result_bonus||0),details:activation.result_details||null}:null }; }) };
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
