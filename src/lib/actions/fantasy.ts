"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "@/lib/auth";
import { getActiveLeague } from "./rounds";
import { getActiveSeason } from "./seasons";
import { DEFAULT_FANTASY_SETTINGS, getFantasyInitialBudget, type FantasySettings } from "@/lib/fantasy/config";
import {
  calculateCostBenefit,
  calculateFantasyForm,
  calculateFantasyPlayerPoints,
  calculateFantasyTrend,
  calculateMarketPopularity,
  getFantasyPlayerTags,
  type FantasyFormLevel,
  type FantasyTagItem,
  type FantasyTrend,
} from "@/lib/fantasy/engine";
import type { FantasyChallengeType } from "@/lib/fantasy/challenges";
import {
  projectFantasyLiveLineups,
  projectFantasyLiveStats,
  type FantasyLiveLineupProjection,
} from "@/lib/fantasy/live-projection";
import type { FantasyLineupSlot } from "@/lib/fantasy/lineup-positions";

export type FantasyMarketPlayer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  profile: string | null;
  isGoalkeeper: boolean;
  isGoodGoalkeeper: boolean;
  goalkeeperConcededAverage: number | null;
  price: number;
  totalPoints: number;
  roundsPlayed: number;
  goals: number;
  assists: number;
  wins: number;
  losses: number;
  games: number;
  goalkeeperGames: number;
  goalsConceded: number;
  teamGoalsConceded: number;
  isInCurrentRound: boolean;
  variation: number;
  priceChange: number;
  roundPoints: number;
  // Métricas V2
  trend: FantasyTrend;
  trendLabel: string;
  trendIcon: string;
  form: FantasyFormLevel;
  formLabel: string;
  formIcon: string;
  formColorClass: string;
  recentPointsList: number[];
  costBenefitScore: number;
  costBenefitRatio: number;
  costBenefitFormatted: string;
  popularityPercent: number;
  captainPercent: number;
  buyersDelta: number;
  hasPreviousHistory: boolean;
  allTags: FantasyTagItem[];
  compactTags: FantasyTagItem[];
};

export type FantasyRadarHighlight = {
  player: FantasyMarketPlayer;
  value: string;
  extra?: string;
  badge?: string;
};

export type FantasyRadarData = {
  mostSelected: FantasyRadarHighlight | null;
  mostCaptained: FantasyRadarHighlight | null;
  topValuation: FantasyRadarHighlight | null;
  topDepreciation: FantasyRadarHighlight | null;
  bestCostBenefit: FantasyRadarHighlight | null;
  bestForm: FantasyRadarHighlight | null;
  mostBought: FantasyRadarHighlight | null;
  mostSold: FantasyRadarHighlight | null;
  favoriteScorer: FantasyRadarHighlight | null;
  favoriteAssist: FantasyRadarHighlight | null;
  totalLineups: number;
  hasMinSample: boolean;
};

export type FantasyDashboardInsights = {
  topRoundPlayer: (FantasyMarketPlayer & { selectionCount?: number }) | null;
  mostSelectedPlayer: (FantasyMarketPlayer & { selectionCount: number }) | null;
  topValuationPlayer: FantasyMarketPlayer | null;
  topDepreciationPlayer: FantasyMarketPlayer | null;
};

export async function getFantasyDashboard() {
  const account = await getCurrentAccount();
  if (!account.user) return { authenticated: false as const };

  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return { authenticated: true as const, available: false as const };

  const { data: settingsRow } = await account.client
    .from("fantasy_settings")
    .select("*")
    .eq("league_id", league.id)
    .maybeSingle();

  const settings: FantasySettings = settingsRow
    ? {
        roleScoringActive: true,
        currencyName: settingsRow.currency_name,
        initialBudget: Number(settingsRow.initial_budget),
        initialPlayerPrice: Number(settingsRow.initial_player_price),
        minPlayerPrice: Number(settingsRow.min_player_price),
        maxPlayerPrice: Number(settingsRow.max_player_price),
        goalPoints: Number(settingsRow.goal_points),
        attackerGoalPoints: Number(settingsRow.attacker_goal_points ?? 5),
        assistPoints: Number(settingsRow.assist_points),
        winPoints: Number(settingsRow.win_points),
        lossPoints: Number(settingsRow.loss_points ?? -1),
        goalkeeperLossPoints: Number(settingsRow.goalkeeper_loss_points ?? settingsRow.loss_points ?? -1),
        goalkeeperAppearancePoints: Number(settingsRow.goalkeeper_appearance_points ?? 3),
        goalConcededPoints: Number(settingsRow.goal_conceded_points ?? -1),
        teamGoalConcededPoints: Number(settingsRow.team_goal_conceded_points ?? -1),
        ownGoalPoints: Number(settingsRow.own_goal_points ?? -3),
        captainMultiplier: Number(settingsRow.captain_multiplier),
        topScorerPredictionPoints: Number(settingsRow.top_scorer_prediction_points),
        topAssistPredictionPoints: Number(settingsRow.top_assist_prediction_points),
        topTeamPredictionPoints: Number(settingsRow.top_team_prediction_points),
        recentWeight: Number(settingsRow.recent_weight),
        kingOfWinsPoints: Number(settingsRow.king_of_wins_points ?? 6),
        mvpPredictionPoints: Number(settingsRow.mvp_prediction_points ?? 8),
        betOfRoundPoints: Number(settingsRow.bet_of_round_points ?? 8),
        betRequiredRanks: [1, 2, 3, 4].map((band) =>
          Number(settingsRow[`bet_rank_band_${band}`] ?? 6 - band)
        ) as [number, number, number, number],
        scoreGoalRewards: [1, 2, 3, 4].map((band) =>
          Number(settingsRow[`score_goal_reward_band_${band}`] ?? [7, 6, 4, 3][band - 1])
        ) as [number, number, number, number],
        winRateWeight: Number(settingsRow.win_rate_weight),
        historicalWeight: Number(settingsRow.historical_weight),
        consistencyWeight: Number(settingsRow.consistency_weight),
        smoothingGames: Number(settingsRow.smoothing_games),
        maxPriceIncrease: Number(settingsRow.max_price_increase),
        maxPriceDecrease: Number(settingsRow.max_price_decrease),
        minSampleForRadar: Number(settingsRow.min_sample_for_radar ?? 3),
      }
    : DEFAULT_FANTASY_SETTINGS;

  const [{ data: testSession }, { data: fantasySeason }] = await Promise.all([
    account.client
      .from("fantasy_test_sessions")
      .select(
        "*, round:round_id(id, number, date, start_time, status, round_type, teams(id, name, color), matches(id, status))"
      )
      .eq("league_id", league.id)
      .eq("season_id", season.id)
      .in("status", ["open", "in_progress"])
      .maybeSingle(),
    account.client
      .from("fantasy_seasons")
      .select("id, initial_budget, initial_player_price")
      .eq("season_id", season.id)
      .maybeSingle(),
  ]);

  if (
    !fantasySeason ||
    !settingsRow ||
    !("king_of_wins_points" in settingsRow) ||
    !("loss_points" in settingsRow) ||
    !("goalkeeper_loss_points" in settingsRow) ||
    !("market_up_share" in settingsRow) ||
    !("team_goal_conceded_points" in settingsRow)
  ) {
    return {
      authenticated: true as const,
      available: false as const,
      settings,
      migrationRequired: true as const,
    };
  }

  const { data: fantasyRoundRows } = await account.client
    .from("fantasy_rounds")
    .select(
      "*, round:round_id(id, number, date, start_time, status, round_type, preparation_stage, teams(id, name, color), matches(id, status))"
    )
    .eq("fantasy_season_id", fantasySeason.id);

  const officialFantasyRounds = (fantasyRoundRows || []).filter(
    (item: any) => item.round?.round_type === "official"
  );
  const byRoundDateDesc = (a: any, b: any) =>
    `${b.round?.date || ""}-${String(b.round?.number || 0).padStart(4, "0")}`.localeCompare(
      `${a.round?.date || ""}-${String(a.round?.number || 0).padStart(4, "0")}`
    );

  const activeOfficialRound =
    officialFantasyRounds
      .filter(
        (item: any) =>
          item.round?.status !== "finished" &&
          (item.market_status === "in_progress" || item.market_status === "open")
      )
      .sort((a: any, b: any) => {
        if (a.market_status !== b.market_status)
          return a.market_status === "in_progress" ? -1 : 1;
        return byRoundDateDesc(a, b);
      })[0] || null;

  const finishedOfficialRounds = officialFantasyRounds
    .filter((item: any) => item.market_status === "finished")
    .sort(byRoundDateDesc);

  const latestFinishedRound = finishedOfficialRounds[0] || null;
  const previousFinishedRound = finishedOfficialRounds[1] || null;

  const isTest = Boolean(testSession);
  const fantasyRound: any = testSession
    ? { ...testSession, market_status: testSession.status }
    : activeOfficialRound;
  const betweenRounds = !isTest && !activeOfficialRound;
  const scoringSnapshot = fantasyRound?.settings_snapshot || null;
  const scoringSettings: FantasySettings = scoringSnapshot
    ? {
        ...settings,
        roleScoringActive: scoringSnapshot.role_scoring_active !== false,
        goalPoints: Number(scoringSnapshot.goal_points ?? settings.goalPoints),
        attackerGoalPoints: Number(scoringSnapshot.attacker_goal_points ?? settings.attackerGoalPoints),
        assistPoints: Number(scoringSnapshot.assist_points ?? settings.assistPoints),
        winPoints: Number(scoringSnapshot.win_points ?? settings.winPoints),
        lossPoints: Number(scoringSnapshot.loss_points ?? settings.lossPoints),
        goalkeeperLossPoints: Number(scoringSnapshot.goalkeeper_loss_points ?? settings.goalkeeperLossPoints),
        goalkeeperAppearancePoints: Number(
          scoringSnapshot.goalkeeper_appearance_points ?? settings.goalkeeperAppearancePoints,
        ),
        goalConcededPoints: Number(scoringSnapshot.goal_conceded_points ?? settings.goalConcededPoints),
        teamGoalConcededPoints: Number(
          scoringSnapshot.team_goal_conceded_points ?? settings.teamGoalConcededPoints,
        ),
        ownGoalPoints: Number(scoringSnapshot.own_goal_points ?? settings.ownGoalPoints),
      }
    : settings;
  const displayRound = fantasyRound?.round || latestFinishedRound?.round || null;
  const displayRoundId = displayRound?.id || null;
  const officialRoundIds = officialFantasyRounds.map((item: any) => item.round?.id).filter(Boolean);
  const matchIds = (displayRound?.matches || []).map((match: any) => match.id);

  // V3: Carregar pacotes, inventário e carta ativa do usuário
  let availablePacks: any[] = [];
  let availablePacksCount = 0;
  let inventoryCount = 0;
  let activeCard: any = null;

  try {
    const { getMyPacks, getMyInventoryCount, getActiveCardForRound } = await import("./fantasy-cards");
    const [packsRes, inventoryCountResult, activeCardRes] = await Promise.all([
      getMyPacks(),
      getMyInventoryCount(),
      displayRoundId ? getActiveCardForRound(displayRoundId) : Promise.resolve(null),
    ]);
    availablePacks = packsRes.availablePacks;
    availablePacksCount = packsRes.availablePacks.length;
    inventoryCount = inventoryCountResult;
    activeCard = activeCardRes;
  } catch (err) {
    console.error("Erro ao carregar dados V3 das cartas:", err);
  }

  const lineupRequest = isTest
    ? account.client
        .from("fantasy_test_lineups")
        .select("*, fantasy_test_lineup_players(*)")
        .eq("test_session_id", fantasyRound.id)
        .eq("user_id", account.user.id)
        .maybeSingle()
    : activeOfficialRound
    ? account.client
        .from("fantasy_lineups")
        .select("*, fantasy_lineup_players(*)")
        .eq("fantasy_round_id", activeOfficialRound.id)
        .eq("user_id", account.user.id)
        .maybeSingle()
    : Promise.resolve({ data: null as any });

  const portfolioRequest = !isTest
    ? account.client
        .from("fantasy_portfolios")
        .select("*, fantasy_portfolio_players(*)")
        .eq("fantasy_season_id", fantasySeason.id)
        .eq("user_id", account.user.id)
        .maybeSingle()
    : Promise.resolve({ data: null as any });

  const latestLineupRequest = latestFinishedRound
    ? account.client
        .from("fantasy_lineups")
        .select("*, fantasy_lineup_players(*)")
        .eq("fantasy_round_id", latestFinishedRound.id)
        .eq("user_id", account.user.id)
        .maybeSingle()
    : Promise.resolve({ data: null as any });

  // Buscar escalações da rodada ativa para popularidade em tempo real
  const activeRoundLineupsRequest = activeOfficialRound
    ? account.client
        .from("fantasy_lineups")
        .select(
          "id, user_id, status, captain_player_id, top_scorer_player_id, top_assist_player_id, fantasy_lineup_players(player_id, slot_role, player_profile_locked)"
        )
        .eq("fantasy_round_id", activeOfficialRound.id)
    : Promise.resolve({ data: [] as any[] });

  // Buscar escalações da rodada anterior para delta de compradores/vendedores
  const previousRoundLineupsRequest = previousFinishedRound
    ? account.client
        .from("fantasy_lineups")
        .select("user_id, fantasy_lineup_players(player_id)")
        .eq("fantasy_round_id", previousFinishedRound.id)
    : Promise.resolve({ data: [] as any[] });

  const liveMatchesRequest = displayRoundId
    ? account.client
        .from("matches")
        .select("id, status, team_a_id, team_b_id, score_a, score_b, match_events(player_id, assist_player_id, team_id, is_own_goal), match_players(player_id, team_id, result_eligible), match_goalkeepers(player_id, team_id)")
        .eq("round_id", displayRoundId)
    : Promise.resolve({ data: [] as any[] });

  const [
    { data: priceRows },
    { data: statRows },
    { data: roundParticipants },
    { data: rawLineup },
    { data: latestLineup },
    { data: fantasyAccount },
    { data: liveEvents },
    { data: selectablePlayers },
    { data: priceHistory },
    { data: latestRoundLineups },
    { data: activeRoundLineups },
    { data: previousRoundLineups },
    { data: rawPortfolio },
    { data: liveMatches },
  ] = await Promise.all([
    account.client.from("fantasy_player_prices").select("*").eq("fantasy_season_id", fantasySeason.id),
    officialRoundIds.length
      ? account.client
          .from("player_round_stats")
          .select("round_id, player_id, goals, assists, wins, losses, own_goals, games, goalkeeper_games, goals_conceded, clean_sheets, defensive_clean_games, defensive_one_goal_games, team_goals_conceded")
          .in("round_id", officialRoundIds)
      : Promise.resolve({ data: [] as any[] }),
    displayRoundId
      ? account.client.from("round_players").select("player_id").eq("round_id", displayRoundId)
      : Promise.resolve({ data: [] as any[] }),
    lineupRequest,
    latestLineupRequest,
    account.client
      .from("fantasy_accounts")
      .select("*")
      .eq("fantasy_season_id", fantasySeason.id)
      .eq("user_id", account.user.id)
      .maybeSingle(),
    matchIds.length
      ? account.client.from("match_events").select("player_id, assist_player_id, is_own_goal").in("match_id", matchIds)
      : Promise.resolve({ data: [] as any[] }),
    account.client
      .from("players")
      .select("id, name, avatar_url, player_profile, member_category, is_selectable")
      .eq("is_selectable", true)
      .eq("member_category", "player"),
    account.client
      .from("fantasy_player_price_history")
      .select(
        "player_id, fantasy_round_id, price_before, price_after, price_change, variation_rate, market_band, round_rank, round_points, goals, assists, wins, games, created_at"
      )
      .eq("fantasy_season_id", fantasySeason.id)
      .order("created_at", { ascending: false }),
    latestFinishedRound
      ? account.client
          .from("fantasy_lineups")
          .select("status, captain_player_id, fantasy_lineup_players(player_id)")
          .eq("fantasy_round_id", latestFinishedRound.id)
          .eq("status", "scored")
      : Promise.resolve({ data: [] as any[] }),
    activeRoundLineupsRequest,
    previousRoundLineupsRequest,
    portfolioRequest,
    liveMatchesRequest,
  ]);

  const lineup =
    isTest && rawLineup
      ? { ...rawLineup, fantasy_lineup_players: rawLineup.fantasy_test_lineup_players || [] }
      : rawLineup;

  const pricePlayerIds = (priceRows || []).map((row: any) => row.player_id);
  const participantIds = (roundParticipants || []).map((row: any) => row.player_id);

  // A consulta de jogadores selecionáveis já trouxe os dados completos do elenco.
  // Só buscamos separadamente os participantes/preços que não façam parte dela
  // (por exemplo, convidados da rodada), evitando ler o elenco inteiro duas vezes.
  const selectableById = new Map((selectablePlayers || []).map((player: any) => [player.id, player]));
  const additionalPlayerIds = [...new Set([...pricePlayerIds, ...participantIds])].filter(
    (playerId) => !selectableById.has(playerId),
  );
  const { data: additionalPlayers } = additionalPlayerIds.length
    ? await account.client
        .from("players")
        .select("id, name, avatar_url, player_profile, member_category, is_selectable")
        .in("id", additionalPlayerIds)
    : { data: [] as any[] };
  const allPlayersById = new Map([
    ...(selectablePlayers || []).map((player: any) => [player.id, player] as const),
    ...(additionalPlayers || []).map((player: any) => [player.id, player] as const),
  ]);
  const players = isTest
    ? participantIds.map((playerId) => allPlayersById.get(playerId)).filter(Boolean)
    : Array.from(allPlayersById.values());

  const priceByPlayer = new Map((priceRows || []).map((row: any) => [row.player_id, row]));
  const statsByPlayer = new Map<
    string,
    { goals: number; assists: number; ownGoals: number; wins: number; losses: number; games: number; goalkeeperGames: number; goalsConceded: number; cleanSheets: number; defensiveCleanGames: number; defensiveOneGoalGames: number; teamGoalsConceded: number }
  >();
  const currentStats = new Map<string, { goals: number; assists: number; ownGoals: number; wins: number; losses: number; goalkeeperGames: number; goalsConceded: number; cleanSheets: number; defensiveCleanGames: number; defensiveOneGoalGames: number; teamGoalsConceded: number }>();

  for (const row of statRows || []) {
    const current = statsByPlayer.get(row.player_id) || {
      goals: 0,
      assists: 0,
      ownGoals: 0,
      wins: 0,
      losses: 0,
      games: 0,
      goalkeeperGames: 0,
      goalsConceded: 0,
      cleanSheets: 0,
      defensiveCleanGames: 0,
      defensiveOneGoalGames: 0,
      teamGoalsConceded: 0,
    };
    current.goals += Number(row.goals || 0);
    current.assists += Number(row.assists || 0);
    current.ownGoals += Number(row.own_goals || 0);
    current.wins += Number(row.wins || 0);
    current.losses += Number(row.losses || 0);
    current.games += Number(row.games || 0);
    current.goalkeeperGames += Number(row.goalkeeper_games || 0);
    current.goalsConceded += Number(row.goals_conceded || 0);
    current.cleanSheets += Number(row.clean_sheets || 0);
    current.defensiveCleanGames += Number(row.defensive_clean_games || 0);
    current.defensiveOneGoalGames += Number(row.defensive_one_goal_games || 0);
    current.teamGoalsConceded += Number(row.team_goals_conceded || 0);
    statsByPlayer.set(row.player_id, current);

    if (row.round_id === displayRoundId) {
      currentStats.set(row.player_id, {
        goals: Number(row.goals || 0),
        assists: Number(row.assists || 0),
        ownGoals: Number(row.own_goals || 0),
        wins: Number(row.wins || 0),
        losses: Number(row.losses || 0),
        goalkeeperGames: Number(row.goalkeeper_games || 0),
        goalsConceded: Number(row.goals_conceded || 0),
        cleanSheets: Number(row.clean_sheets || 0),
        defensiveCleanGames: Number(row.defensive_clean_games || 0),
        defensiveOneGoalGames: Number(row.defensive_one_goal_games || 0),
        teamGoalsConceded: Number(row.team_goals_conceded || 0),
      });
    }
  }

  if (liveEvents?.length) {
    for (const current of currentStats.values()) {
      current.goals = 0;
      current.assists = 0;
      current.ownGoals = 0;
    }
    for (const event of liveEvents) {
      const scorer = currentStats.get(event.player_id) || { goals: 0, assists: 0, ownGoals: 0, wins: 0, losses: 0, goalkeeperGames: 0, goalsConceded: 0, cleanSheets: 0, defensiveCleanGames: 0, defensiveOneGoalGames: 0, teamGoalsConceded: 0 };
      if (event.is_own_goal) scorer.ownGoals += 1;
      else scorer.goals += 1;
      currentStats.set(event.player_id, scorer);
      if (event.assist_player_id && !event.is_own_goal) {
        const assister = currentStats.get(event.assist_player_id) || { goals: 0, assists: 0, ownGoals: 0, wins: 0, losses: 0, goalkeeperGames: 0, goalsConceded: 0, cleanSheets: 0, defensiveCleanGames: 0, defensiveOneGoalGames: 0, teamGoalsConceded: 0 };
        assister.assists += 1;
        currentStats.set(event.assist_player_id, assister);
      }
    }
    for (const [playerId, current] of currentStats) {
      const official = (statRows || []).find(
        (row: any) => row.round_id === displayRoundId && row.player_id === playerId
      );
      current.wins = Number(official?.wins || 0);
      current.losses = Number(official?.losses || 0);
      current.ownGoals = Number(official?.own_goals || 0);
      current.goalkeeperGames = Number(official?.goalkeeper_games || 0);
      current.goalsConceded = Number(official?.goals_conceded || 0);
      current.cleanSheets = Number(official?.clean_sheets || 0);
      current.defensiveCleanGames = Number(official?.defensive_clean_games || 0);
      current.defensiveOneGoalGames = Number(official?.defensive_one_goal_games || 0);
      current.teamGoalsConceded = Number(official?.team_goals_conceded || 0);
    }
  }

  const liveStats = projectFantasyLiveStats(
    (liveMatches || []).map((match: any) => ({
      id: match.id,
      status: match.status,
      teamAId: match.team_a_id,
      teamBId: match.team_b_id,
      scoreA: Number(match.score_a || 0),
      scoreB: Number(match.score_b || 0),
      players: (match.match_players || []).map((item: any) => ({
        playerId: item.player_id,
        teamId: item.team_id,
        resultEligible: Boolean(item.result_eligible),
        playerProfile: allPlayersById.get(item.player_id)?.player_profile || null,
      })),
      goalkeepers: (match.match_goalkeepers || []).map((item: any) => ({
        playerId: item.player_id,
        teamId: item.team_id,
      })),
      events: (match.match_events || []).map((item: any) => ({
        playerId: item.player_id,
        assistPlayerId: item.assist_player_id,
        teamId: item.team_id,
        isOwnGoal: Boolean(item.is_own_goal),
      })),
    })),
    scoringSettings,
  );

  if (fantasyRound?.market_status === "in_progress") {
    for (const [playerId, item] of liveStats) {
      currentStats.set(playerId, {
        goals: item.goals,
        assists: item.assists,
        ownGoals: item.ownGoals,
        wins: item.wins,
        losses: item.losses,
        goalkeeperGames: item.goalkeeperGames,
        goalsConceded: item.goalsConceded,
        cleanSheets: item.cleanSheets,
        defensiveCleanGames: item.defensiveCleanGames,
        defensiveOneGoalGames: item.defensiveOneGoalGames,
        teamGoalsConceded: item.teamGoalsConceded,
      });
    }
  }

  // Agregações de Histórico de Preço e Pontuações Recentes
  const lastVariation = new Map<string, number>();
  const lastPriceChange = new Map<string, number>();
  const latestRoundPerformance = new Map<string, number>();
  const recentVariationsByPlayer = new Map<string, number[]>();
  const recentPointsByPlayer = new Map<string, number[]>();

  for (const row of priceHistory || []) {
    if (!lastVariation.has(row.player_id)) {
      lastVariation.set(row.player_id, Number(row.variation_rate || 0));
      lastPriceChange.set(
        row.player_id,
        Number(row.price_after || 0) - Number(row.price_before || 0)
      );
    }
    if (latestFinishedRound && row.fantasy_round_id === latestFinishedRound.id) {
      latestRoundPerformance.set(row.player_id, Number(row.round_points || 0));
    }
    if (Number(row.games || 0) > 0) {
      const varList = recentVariationsByPlayer.get(row.player_id) || [];
      if (varList.length < 5) {
        varList.push(Number(row.variation_rate || 0));
        recentVariationsByPlayer.set(row.player_id, varList);
      }
      const ptsList = recentPointsByPlayer.get(row.player_id) || [];
      if (ptsList.length < 5) {
        ptsList.push(Number(row.round_points || 0));
        recentPointsByPlayer.set(row.player_id, ptsList);
      }
    }
  }

  // Calcular Popularidade de Mercado usando o motor V2
  const currentLineupsFormatted = (
    activeOfficialRound ? activeRoundLineups : latestRoundLineups
  )?.map((l: any) => ({
    userId: l.user_id,
    playerIds: (l.fantasy_lineup_players || []).map((p: any) => p.player_id),
    captainPlayerId: l.captain_player_id,
    topScorerPlayerId: l.top_scorer_player_id,
    topAssistPlayerId: l.top_assist_player_id,
  })) || [];

  const previousLineupsFormatted = (
    activeOfficialRound ? latestRoundLineups : previousRoundLineups
  )?.map((l: any) => ({
    userId: l.user_id,
    playerIds: (l.fantasy_lineup_players || []).map((p: any) => p.player_id),
  })) || [];

  const popularityAgg = calculateMarketPopularity({
    currentLineups: currentLineupsFormatted,
    previousLineups: previousLineupsFormatted,
    minSample: settings.minSampleForRadar ?? 3,
  });

  const market: FantasyMarketPlayer[] = (players || [])
    .filter((player: any) => player.member_category === "player" && player.is_selectable)
    .map((player: any) => {
      const priceRow = priceByPlayer.get(player.id) as any;
      const stats = statsByPlayer.get(player.id) || {
        goals: 0,
        assists: 0,
        ownGoals: 0,
        wins: 0,
        losses: 0,
        games: 0,
        goalkeeperGames: 0,
        goalsConceded: 0,
        cleanSheets: 0,
        defensiveCleanGames: 0,
        defensiveOneGoalGames: 0,
        teamGoalsConceded: 0,
      };
      const price = isTest
        ? settings.initialPlayerPrice
        : Number(priceRow?.current_price ?? settings.initialPlayerPrice);
      const totalPoints = isTest ? 0 : Number(priceRow?.total_points || 0);
      const roundsPlayed = isTest ? 0 : Number(priceRow?.rounds_played || 0);
      const variation = isTest ? 0 : lastVariation.get(player.id) || 0;
      const priceChange = isTest ? 0 : lastPriceChange.get(player.id) || 0;
      const roundPoints = betweenRounds
        ? latestRoundPerformance.get(player.id) || 0
        : calculateFantasyPlayerPoints(
            {
              goals: currentStats.get(player.id)?.goals || 0,
              assists: currentStats.get(player.id)?.assists || 0,
              ownGoals: currentStats.get(player.id)?.ownGoals || 0,
              wins: currentStats.get(player.id)?.wins || 0,
              losses: currentStats.get(player.id)?.losses || 0,
              goalkeeperGames: currentStats.get(player.id)?.goalkeeperGames || 0,
              goalsConceded: currentStats.get(player.id)?.goalsConceded || 0,
              defensiveCleanGames: currentStats.get(player.id)?.defensiveCleanGames || 0,
              defensiveOneGoalGames: currentStats.get(player.id)?.defensiveOneGoalGames || 0,
              teamGoalsConceded: currentStats.get(player.id)?.teamGoalsConceded || 0,
              playerProfile: player.player_profile,
            },
            scoringSettings,
          );

      const playerRecentPoints = recentPointsByPlayer.get(player.id) || [];
      const playerRecentVars = recentVariationsByPlayer.get(player.id) || [];

      const trendData = calculateFantasyTrend(playerRecentVars);
      const formData = calculateFantasyForm(playerRecentPoints);
      const avgPoints = roundsPlayed > 0 ? totalPoints / roundsPlayed : 0;
      const costBenefit = calculateCostBenefit(avgPoints, price);
      const popularity = popularityAgg.getPopularity(player.id);

      const gkGames = stats.goalkeeperGames || 0;
      const gkConceded = stats.goalsConceded || 0;
      const goalkeeperConcededAverage = gkGames > 0 ? Number((gkConceded / gkGames).toFixed(2)) : null;
      const isGoodGoalkeeper =
        Boolean(player.is_goalkeeper) ||
        (gkGames >= 2 && goalkeeperConcededAverage !== null && goalkeeperConcededAverage <= 1.25) ||
        (gkGames >= 1 && gkConceded === 0);

      const { allTags, compactTags } = getFantasyPlayerTags({
        price,
        totalPoints,
        roundsPlayed,
        recentPoints: playerRecentPoints,
        recentVariations: playerRecentVars,
        goals: stats.goals,
        assists: stats.assists,
        goalkeeperGames: gkGames,
        goalsConceded: gkConceded,
        isGoalkeeper: Boolean(player.is_goalkeeper),
        popularityPercent: popularity.percent,
        captainPercent: popularity.captainPercent,
      });

      return {
        id: player.id,
        name: player.name,
        avatarUrl: player.avatar_url,
        profile: player.player_profile,
        isGoalkeeper: Boolean(player.is_goalkeeper),
        isGoodGoalkeeper,
        goalkeeperConcededAverage,
        isInCurrentRound: Boolean(fantasyRound && participantIds.includes(player.id)),
        price,
        totalPoints,
        roundsPlayed,
        ...stats,
        variation,
        priceChange,
        roundPoints,
        trend: trendData.trend,
        trendLabel: trendData.label,
        trendIcon: trendData.icon,
        form: formData.form,
        formLabel: formData.label,
        formIcon: formData.icon,
        formColorClass: formData.colorClass,
        recentPointsList: playerRecentPoints,
        costBenefitScore: costBenefit.score,
        costBenefitRatio: costBenefit.ratio,
        costBenefitFormatted: costBenefit.formattedRatio,
        popularityPercent: popularity.percent,
        captainPercent: popularity.captainPercent,
        buyersDelta: popularity.buyersDelta,
        hasPreviousHistory: popularity.hasHistory,
        allTags,
        compactTags,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name, "pt-BR"));

  let effectiveLineup: any =
    lineup ||
    (rawPortfolio
      ? {
          ...rawPortfolio,
          captain_player_id: rawPortfolio.captain_player_id,
          fantasy_lineup_players: (rawPortfolio.fantasy_portfolio_players || []).filter(
            (item: any) => market.some((player) => player.id === item.player_id)
          ),
          status: betweenRounds ? "portfolio" : "suggested",
        }
      : null);

  if (
    effectiveLineup &&
    !effectiveLineup.fantasy_lineup_players?.some(
      (item: any) => item.player_id === effectiveLineup.captain_player_id
    )
  ) {
    effectiveLineup.captain_player_id = null;
  }

  if (!effectiveLineup && !isTest) {
    const savedSelection = latestLineup;
    if (savedSelection) {
      const eligiblePlayers = (savedSelection.fantasy_lineup_players || []).filter(
        (item: any) => market.some((player) => player.id === item.player_id)
      );
      const suggestedCost = eligiblePlayers.reduce(
        (sum: number, item: any) =>
          sum + (market.find((player) => player.id === item.player_id)?.price || 0),
        0
      );
      if (
        suggestedCost <= Number(fantasyAccount?.current_budget ?? settings.initialBudget)
      ) {
        effectiveLineup = {
          ...savedSelection,
          status: betweenRounds ? "previous" : "suggested",
          fantasy_lineup_players: eligiblePlayers,
        };
      }
    }
  }

  // Montagem do Radar Cartola V2
  const sortedByPopularity = [...market].sort(
    (a, b) => b.popularityPercent - a.popularityPercent || b.totalPoints - a.totalPoints
  );
  const sortedByCaptain = [...market].sort(
    (a, b) => b.captainPercent - a.captainPercent || b.totalPoints - a.totalPoints
  );
  const sortedByValuation = [...market]
    .filter((p) => p.priceChange > 0)
    .sort((a, b) => b.priceChange - a.priceChange);
  const sortedByDepreciation = [...market]
    .filter((p) => p.priceChange < 0)
    .sort((a, b) => a.priceChange - b.priceChange);
  const sortedByCostBenefit = [...market]
    .filter((p) => p.roundsPlayed >= 1)
    .sort((a, b) => b.costBenefitScore - a.costBenefitScore || b.totalPoints - a.totalPoints);
  const sortedByForm = [...market]
    .filter((p) => p.recentPointsList.length >= 1)
    .sort((a, b) => {
      const sumA = a.recentPointsList.slice(0, 3).reduce((x, y) => x + y, 0);
      const sumB = b.recentPointsList.slice(0, 3).reduce((x, y) => x + y, 0);
      return sumB - sumA;
    });
  const sortedByBought = [...market]
    .filter((p) => p.buyersDelta > 0)
    .sort((a, b) => b.buyersDelta - a.buyersDelta);
  const sortedBySold = [...market]
    .filter((p) => p.buyersDelta < 0)
    .sort((a, b) => a.buyersDelta - b.buyersDelta);

  const topScorerId = [...popularityAgg.scorerPredictionCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0];
  const topAssistId = [...popularityAgg.assistPredictionCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0];

  const radarData: FantasyRadarData = {
    totalLineups: popularityAgg.totalLineups,
    hasMinSample: popularityAgg.hasMinSample,
    mostSelected:
      sortedByPopularity[0] && sortedByPopularity[0].popularityPercent > 0
        ? {
            player: sortedByPopularity[0],
            value: `${sortedByPopularity[0].popularityPercent}%`,
            extra: "dos cartoleiros escalaram",
            badge: "Mais Escalado",
          }
        : null,
    mostCaptained:
      sortedByCaptain[0] && sortedByCaptain[0].captainPercent > 0
        ? {
            player: sortedByCaptain[0],
            value: `${sortedByCaptain[0].captainPercent}%`,
            extra: "como capitão da rodada",
            badge: "Mais Capitão",
          }
        : null,
    topValuation: sortedByValuation[0]
      ? {
          player: sortedByValuation[0],
          value: `+${(sortedByValuation[0].variation * 100).toFixed(1)}%`,
          extra: `+C$ ${sortedByValuation[0].priceChange.toFixed(2)}`,
          badge: "Maior Valorização",
        }
      : null,
    topDepreciation: sortedByDepreciation[0]
      ? {
          player: sortedByDepreciation[0],
          value: `${(sortedByDepreciation[0].variation * 100).toFixed(1)}%`,
          extra: `-C$ ${Math.abs(sortedByDepreciation[0].priceChange).toFixed(2)}`,
          badge: "Maior Queda",
        }
      : null,
    bestCostBenefit: sortedByCostBenefit[0]
      ? {
          player: sortedByCostBenefit[0],
          value: `${sortedByCostBenefit[0].costBenefitScore.toFixed(1)}/10`,
          extra: sortedByCostBenefit[0].costBenefitFormatted,
          badge: "Melhor Custo-Benefício",
        }
      : null,
    bestForm: sortedByForm[0]
      ? {
          player: sortedByForm[0],
          value: `${sortedByForm[0].recentPointsList.slice(0, 3).reduce((x, y) => x + y, 0).toFixed(1)} pts`,
          extra: "nas últimas rodadas",
          badge: "Melhor Forma",
        }
      : null,
    mostBought: sortedByBought[0]
      ? {
          player: sortedByBought[0],
          value: `+${sortedByBought[0].buyersDelta}`,
          extra: "novos compradores",
          badge: "Mais Comprado",
        }
      : null,
    mostSold: sortedBySold[0]
      ? {
          player: sortedBySold[0],
          value: `${sortedBySold[0].buyersDelta}`,
          extra: "vendas na rodada",
          badge: "Mais Vendido",
        }
      : null,
    favoriteScorer: topScorerId
      ? {
          player: market.find((p) => p.id === topScorerId)!,
          value: `${Math.round(
            ((popularityAgg.scorerPredictionCounts.get(topScorerId) || 0) /
              Math.max(1, popularityAgg.totalLineups)) *
              100
          )}%`,
          extra: "dos palpites de gol",
          badge: "Favorito a Artilheiro",
        }
      : null,
    favoriteAssist: topAssistId
      ? {
          player: market.find((p) => p.id === topAssistId)!,
          value: `${Math.round(
            ((popularityAgg.assistPredictionCounts.get(topAssistId) || 0) /
              Math.max(1, popularityAgg.totalLineups)) *
              100
          )}%`,
          extra: "dos palpites de garçom",
          badge: "Favorito a Garçom",
        }
      : null,
  };

  const topRoundPlayer = [...market].sort(
    (a, b) => b.roundPoints - a.roundPoints || a.name.localeCompare(b.name, "pt-BR")
  )[0] || null;
  const mostSelectedBase = sortedByPopularity[0] || null;

  const insights: FantasyDashboardInsights = {
    topRoundPlayer:
      topRoundPlayer && topRoundPlayer.roundPoints > 0
        ? {
            ...topRoundPlayer,
            selectionCount: popularityAgg.selectionCounts.get(topRoundPlayer.id) || 0,
          }
        : null,
    mostSelectedPlayer:
      mostSelectedBase && (popularityAgg.selectionCounts.get(mostSelectedBase.id) || 0) > 0
        ? {
            ...mostSelectedBase,
            selectionCount: popularityAgg.selectionCounts.get(mostSelectedBase.id) || 0,
          }
        : null,
    topValuationPlayer: sortedByValuation[0] || null,
    topDepreciationPlayer: sortedByDepreciation[0] || null,
  };

  const projectedLineups = fantasyRound?.market_status === "in_progress"
    ? projectFantasyLiveLineups(
        (activeRoundLineups || [])
          .filter((item: any) => item.status !== "missed")
          .map((item: any) => ({
            id: item.id,
            userId: item.user_id,
            playerIds: (item.fantasy_lineup_players || []).map((player: any) => player.player_id),
            slots: (item.fantasy_lineup_players || [])
              .filter((player: any) => player.slot_role)
              .map((player: any) => ({
                playerId: player.player_id,
                slotRole: player.slot_role,
                playerProfile: player.player_profile_locked,
              })),
            captainPlayerId: item.captain_player_id,
            topScorerPlayerId: item.top_scorer_player_id,
            topAssistPlayerId: item.top_assist_player_id,
          })),
        liveStats,
        scoringSettings,
        new Set(market.map((player) => player.id)),
      )
    : [];
  const liveProjection: FantasyLiveProjection = {
    isLive: fantasyRound?.market_status === "in_progress",
    calculatedAt: new Date().toISOString(),
    playerPoints: [...liveStats.values()].map((item) => ({ playerId: item.playerId, points: item.basePoints })),
    currentUser: projectedLineups.find((item) => item.userId === account.user!.id) || null,
  };

  const playersPerTeam = league.players_per_team || 5;
  const dynamicInitialBudget = getFantasyInitialBudget(playersPerTeam);
  const storedBudget = Number(fantasyAccount?.current_budget ?? dynamicInitialBudget);
  const adjustedBudget = isTest
    ? dynamicInitialBudget
    : Math.max(storedBudget, dynamicInitialBudget);

  return {
    authenticated: true as const,
    available: true as const,
    isAdmin: account.isAdmin,
    settings,
    playersPerTeam,
    round: displayRound,
    fantasySeasonId: fantasySeason.id,
    fantasyRound: {
      id: fantasyRound?.id || null,
      status: betweenRounds ? "between_rounds" : fantasyRound.market_status,
      lockedAt: fantasyRound?.locked_at || null,
      isTest,
      betweenRounds,
      challengeType: (fantasyRound?.challenge_type || null) as FantasyChallengeType | null,
      rulesVersion: Number(fantasyRound?.rules_version || 0),
    },
    market,
    lineup: effectiveLineup,
    insights,
    radar: radarData,
    budget: adjustedBudget,
    account: {
      totalPoints: Number(fantasyAccount?.total_points || 0),
      roundsPlayed: Number(fantasyAccount?.rounds_played || 0),
      bestRoundPoints: Number(fantasyAccount?.best_round_points || 0),
    },
    lastRound: latestFinishedRound
      ? {
          number: latestFinishedRound.round?.number,
          date: latestFinishedRound.round?.date,
          playerPoints: Number(latestLineup?.player_points || 0),
          predictionPoints: Number(latestLineup?.prediction_points || 0),
          totalPoints: Number(latestLineup?.total_points || 0),
        }
      : null,
    // V3: Pacotes, Inventário e Carta Ativa
    activeCard,
    availablePacks,
    availablePacksCount,
    inventoryCount,
    liveProjection,
  };
}

export async function saveFantasyLineup(input: {
  fantasySeasonId: string;
  roundId: string | null;
  playerIds: string[];
  slotAssignments: FantasyLineupSlot[];
  captainId: string | null;
  scorerId: string | null;
  assistId: string | null;
  challengeId: string | null;
}) {
  try {
    const account = await getCurrentAccount();
    if (!account.user) return { success: false, error: "Entre na sua conta para escalar." };
    const league = await getActiveLeague();
    const maxPlayers = league.players_per_team || 5;
    if (input.playerIds.length > maxPlayers || new Set(input.playerIds).size !== input.playerIds.length) {
      return {
        success: false,
        error: `A escalação enviada é inválida. Aceita no máximo ${maxPlayers} jogadores.`,
      };
    }
    const slotAssignmentsAreValid =
      input.slotAssignments.length === input.playerIds.length &&
      new Set(input.slotAssignments.map((slot) => slot.playerId)).size === input.playerIds.length &&
      new Set(input.slotAssignments.map((slot) => slot.slotIndex)).size === input.playerIds.length &&
      input.slotAssignments.every(
        (slot) =>
          input.playerIds.includes(slot.playerId) &&
          Number.isInteger(slot.slotIndex) &&
          slot.slotIndex >= 0 &&
          ["GOL", "DEF", "MEI", "ATA"].includes(slot.slotRole),
      );
    if (!slotAssignmentsAreValid) {
      return { success: false, error: "As posições da escalação são inválidas. Ajuste o time e tente novamente." };
    }
    const dbSlots = input.slotAssignments.map((slot) => ({
      player_id: slot.playerId,
      slot_index: slot.slotIndex,
      slot_role: slot.slotRole,
    }));
    if (!input.roundId) {
      const { error } = await account.client.rpc("save_fantasy_portfolio", {
        p_fantasy_season_id: input.fantasySeasonId,
        p_player_ids: input.playerIds,
        p_captain_player_id: input.captainId,
        p_lineup_slots: dbSlots,
      });
      if (error) return { success: false, error: error.message };
      revalidatePath("/cartola");
      return { success: true };
    }
    const { data: testSession } = input.roundId
      ? await account.client
          .from("fantasy_test_sessions")
          .select("id")
          .eq("round_id", input.roundId)
          .maybeSingle()
      : { data: null };
    if (testSession && input.roundId) {
      const { error } = await account.client.rpc("save_fantasy_test_lineup", {
        p_round_id: input.roundId,
        p_player_ids: input.playerIds,
        p_captain_player_id: input.captainId,
        p_top_scorer_player_id: input.scorerId,
        p_top_assist_player_id: input.assistId,
        p_challenge_player_id: input.challengeId,
        p_lineup_slots: dbSlots,
      });
      if (error) return { success: false, error: error.message };
    } else {
      const { error: lineupError } = await account.client.rpc("save_fantasy_lineup", {
        p_round_id: input.roundId,
        p_player_ids: input.playerIds,
        p_captain_player_id: input.captainId,
        p_top_scorer_player_id: input.scorerId,
        p_top_assist_player_id: input.assistId,
        p_challenge_player_id: input.challengeId,
        p_lineup_slots: dbSlots,
      });
      if (lineupError) return { success: false, error: lineupError.message };
    }
    revalidatePath("/cartola");
    revalidatePath("/");
    revalidatePath("/notificacoes");
    return { success: true };
  } catch (error) {
    console.error("Erro inesperado ao salvar escalação do Cartola:", error);
    return {
      success: false,
      error: "Não foi possível salvar agora. Atualize a página e tente novamente.",
    };
  }
}

/**
 * Revelação de Escalações Pós-Fechamento do Mercado:
 * Se o mercado estiver ABERTO: Omitir e bloquear acesso aos detalhes de terceiros.
 * Se o mercado estiver FECHADO/FINALIZADO: Permitir visualização detalhada somente-leitura.
 */
export async function getRevealedLineups(roundId?: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { allowed: false, error: "Autenticação necessária.", lineups: [] };

  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return { allowed: false, error: "Temporada não encontrada.", lineups: [] };

  const { data: fs } = await account.client
    .from("fantasy_seasons")
    .select("id")
    .eq("season_id", season.id)
    .maybeSingle();
  if (!fs) return { allowed: false, error: "Fantasy Season não encontrada.", lineups: [] };

  let targetFantasyRound: any = null;
  if (roundId) {
    const { data } = await account.client
      .from("fantasy_rounds")
      .select("id, market_status, round:round_id(id, number, date, status)")
      .eq("fantasy_season_id", fs.id)
      .eq("round_id", roundId)
      .maybeSingle();
    targetFantasyRound = data;
  } else {
    const { data } = await account.client
      .from("fantasy_rounds")
      .select("id, market_status, round:round_id(id, number, date, status)")
      .eq("fantasy_season_id", fs.id)
      .order("created_at", { ascending: false })
      .limit(1);
    targetFantasyRound = data?.[0] || null;
  }

  if (!targetFantasyRound) {
    return { allowed: false, error: "Rodada não encontrada.", lineups: [] };
  }

  // REGRA DE SEGURANÇA: Se o mercado estiver aberto, BLOQUEAR revelação individual de terceiros!
  const isMarketClosed =
    targetFantasyRound.market_status === "in_progress" ||
    targetFantasyRound.market_status === "finished" ||
    targetFantasyRound.round?.status === "finished";

  if (!isMarketClosed) {
    return {
      allowed: false,
      isMarketOpen: true,
      error: "As escalações só são reveladas após o fechamento do mercado (início da primeira partida).",
      lineups: [],
    };
  }

  // Buscar todas as escalações com jogadores travados e snapshots
  const { data: rawLineups } = await account.client
    .from("fantasy_lineups")
    .select(
      `
      id, user_id, status, captain_player_id, top_scorer_player_id, top_assist_player_id, challenge_player_id,
      player_points, prediction_points, total_points, round_position,
      fantasy_lineup_players (
        id, player_id, price_locked, price_after, base_points, captain_bonus, total_points,
        player_name_locked, avatar_url_locked
      )
    `
    )
    .eq("fantasy_round_id", targetFantasyRound.id)
    .in("status", ["locked", "scored"]);

  const userIds = (rawLineups || []).map((l: any) => l.user_id);
  const { data: profiles } = userIds.length
    ? await account.client
        .from("account_profiles")
        .select("user_id, players(name, avatar_url)")
        .in("user_id", userIds)
    : { data: [] as any[] };

  const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.players]));

  // Buscar dados dos palpites para nomes bonitos
  const allPredictIds = (rawLineups || []).flatMap((l: any) =>
    [l.top_scorer_player_id, l.top_assist_player_id, l.challenge_player_id].filter(Boolean)
  );
  const { data: predictedPlayers } = allPredictIds.length
    ? await account.client.from("players").select("id, name, avatar_url").in("id", allPredictIds)
    : { data: [] as any[] };

  const predictedMap = new Map((predictedPlayers || []).map((p: any) => [p.id, p]));

  const { data: activations } = userIds.length
    ? await account.client
        .from("fantasy_card_activations")
        .select("user_id, status, result_bonus, result_details, cards(name, slug, rarity)")
        .eq("round_id", targetFantasyRound.round.id)
        .in("user_id", userIds)
    : { data: [] as any[] };
  const activationMap = new Map((activations || []).map((activation: any) => [activation.user_id, activation]));

  const revealed = (rawLineups || []).map((l: any) => {
    const prof: any = profileMap.get(l.user_id);
    const scorer: any = predictedMap.get(l.top_scorer_player_id);
    const assist: any = predictedMap.get(l.top_assist_player_id);
    const challenge: any = predictedMap.get(l.challenge_player_id);
    const activation: any = activationMap.get(l.user_id);
    const activatedCard: any = activation?.cards;

    return {
      lineupId: l.id,
      userId: l.user_id,
      isCurrentUser: l.user_id === account.user!.id,
      userName: prof?.name || "Cartoleiro",
      userAvatarUrl: prof?.avatar_url || null,
      totalPoints: Number(l.total_points || 0),
      playerPoints: Number(l.player_points || 0),
      predictionPoints: Number(l.prediction_points || 0),
      position: l.round_position || null,
      captainId: l.captain_player_id,
      topScorer: scorer ? { id: scorer.id, name: scorer.name } : null,
      topAssist: assist ? { id: assist.id, name: assist.name } : null,
      challengePlayer: challenge ? { id: challenge.id, name: challenge.name } : null,
      activeCard: activatedCard
        ? {
            name: activatedCard.name,
            slug: activatedCard.slug,
            rarity: activatedCard.rarity,
            status: activation.status,
            bonus: Number(activation.result_bonus || 0),
            details: activation.result_details || null,
          }
        : null,
      players: (l.fantasy_lineup_players || []).map((lp: any) => ({
        playerId: lp.player_id,
        name: lp.player_name_locked || "Jogador",
        avatarUrl: lp.avatar_url_locked || null,
        isCaptain: lp.player_id === l.captain_player_id,
        priceLocked: Number(lp.price_locked || 0),
        priceAfter: lp.price_after != null ? Number(lp.price_after) : null,
        basePoints: Number(lp.base_points || 0),
        captainBonus: Number(lp.captain_bonus || 0),
        points: Number(lp.total_points || 0),
      })),
    };
  });

  revealed.sort((a: any, b: any) => b.totalPoints - a.totalPoints);

  return {
    allowed: true,
    isMarketOpen: false,
    roundNumber: targetFantasyRound.round?.number,
    roundDate: targetFantasyRound.round?.date,
    lineups: revealed,
  };
}

export async function getFantasyPlayerDetail(playerId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return null;

  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return null;

  const { data: fs } = await account.client
    .from("fantasy_seasons")
    .select("id")
    .eq("season_id", season.id)
    .maybeSingle();
  if (!fs) return null;

  const [
    { data: playerRow },
    { data: priceRow },
    { data: historyRows },
    { data: statRows },
  ] = await Promise.all([
    account.client
      .from("players")
      .select("id, name, avatar_url, player_profile, is_goalkeeper, member_category")
      .eq("id", playerId)
      .maybeSingle(),
    account.client
      .from("fantasy_player_prices")
      .select("*")
      .eq("fantasy_season_id", fs.id)
      .eq("player_id", playerId)
      .maybeSingle(),
    account.client
      .from("fantasy_player_price_history")
      .select(
        "id, fantasy_round_id, price_before, price_after, price_change, variation_rate, market_band, round_rank, round_percentile, round_points, goals, assists, wins, games, created_at, fantasy_rounds(round:round_id(number, date))"
      )
      .eq("fantasy_season_id", fs.id)
      .eq("player_id", playerId)
      .order("created_at", { ascending: true }),
    account.client
      .from("player_round_stats")
      .select("goals, assists, wins, losses, games, goalkeeper_games, goals_conceded")
      .eq("player_id", playerId),
  ]);

  if (!playerRow) return null;

  const price = Number(priceRow?.current_price ?? DEFAULT_FANTASY_SETTINGS.initialPlayerPrice);
  const totalPoints = Number(priceRow?.total_points || 0);
  const roundsPlayed = Number(priceRow?.rounds_played || 0);
  const avgPoints = roundsPlayed > 0 ? totalPoints / roundsPlayed : 0;

  const stats = (statRows || []).reduce(
    (acc: any, row: any) => {
      acc.goals += Number(row.goals || 0);
      acc.assists += Number(row.assists || 0);
      acc.wins += Number(row.wins || 0);
      acc.losses += Number(row.losses || 0);
      acc.games += Number(row.games || 0);
      acc.goalkeeperGames += Number(row.goalkeeper_games || 0);
      acc.goalsConceded += Number(row.goals_conceded || 0);
      return acc;
    },
    { goals: 0, assists: 0, wins: 0, losses: 0, games: 0, goalkeeperGames: 0, goalsConceded: 0 }
  );

  const history = (historyRows || []).map((h: any) => ({
    id: h.id,
    roundNumber: h.fantasy_rounds?.round?.number || null,
    roundDate: h.fantasy_rounds?.round?.date || null,
    priceBefore: Number(h.price_before),
    priceAfter: Number(h.price_after),
    variationRate: Number(h.variation_rate),
    priceChange: Number(h.price_change ?? Number(h.price_after) - Number(h.price_before)),
    marketBand: h.market_band || "STABLE",
    roundRank: h.round_rank == null ? null : Number(h.round_rank),
    roundPercentile: h.round_percentile == null ? null : Number(h.round_percentile),
    roundPoints: Number(h.round_points),
    goals: Number(h.goals || 0),
    assists: Number(h.assists || 0),
    wins: Number(h.wins || 0),
    games: Number(h.games || 0),
    createdAt: h.created_at,
  }));

  const validRecentHistory = history.filter((h) => h.games > 0);
  const recentPointsList = validRecentHistory.slice(-5).map((h) => h.roundPoints);
  const recentVariations = validRecentHistory.slice(-5).map((h) => h.variationRate);

  const trendData = calculateFantasyTrend(recentVariations);
  const formData = calculateFantasyForm(recentPointsList);
  const costBenefit = calculateCostBenefit(avgPoints, price);

  const gkGames = stats.goalkeeperGames || 0;
  const gkConceded = stats.goalsConceded || 0;

  const { allTags, compactTags } = getFantasyPlayerTags({
    price,
    totalPoints,
    roundsPlayed,
    recentPoints: recentPointsList,
    recentVariations,
    goals: stats.goals,
    assists: stats.assists,
    goalkeeperGames: gkGames,
    goalsConceded: gkConceded,
    isGoalkeeper: Boolean(playerRow.is_goalkeeper),
  });

  return {
    player: {
      id: playerRow.id,
      name: playerRow.name,
      avatarUrl: playerRow.avatar_url,
      profile: playerRow.player_profile,
      memberCategory: playerRow.member_category,
    },
    price,
    totalPoints,
    roundsPlayed,
    averagePoints: avgPoints,
    stats,
    trend: trendData.trend,
    trendLabel: trendData.label,
    trendIcon: trendData.icon,
    form: formData.form,
    formLabel: formData.label,
    formIcon: formData.icon,
    formColorClass: formData.colorClass,
    costBenefitScore: costBenefit.score,
    costBenefitRatio: costBenefit.ratio,
    costBenefitFormatted: costBenefit.formattedRatio,
    recentPointsList,
    allTags,
    compactTags,
    history,
  };
}

async function getLiveRoundProjections(client: any, fantasySeasonId: string, leagueId: string) {
  const { data: activeRound } = await client
    .from("fantasy_rounds")
    .select("id, round_id, market_status, settings_snapshot, round:round_id(status)")
    .eq("fantasy_season_id", fantasySeasonId)
    .eq("market_status", "in_progress")
    .maybeSingle();
  if (!activeRound?.round_id) return null;

  const [{ data: settingsRow }, { data: matches }, { data: lineups }, { data: leagueRow }, { data: playerRows }] = await Promise.all([
    client.from("fantasy_settings").select("*").eq("league_id", leagueId).maybeSingle(),
    client
      .from("matches")
      .select("id, status, team_a_id, team_b_id, score_a, score_b, match_events(player_id, assist_player_id, team_id, is_own_goal), match_players(player_id, team_id, result_eligible), match_goalkeepers(player_id, team_id)")
      .eq("round_id", activeRound.round_id),
    client
      .from("fantasy_lineups")
      .select("id, user_id, status, captain_player_id, top_scorer_player_id, top_assist_player_id, fantasy_lineup_players(player_id, slot_role, player_profile_locked)")
      .eq("fantasy_round_id", activeRound.id)
      .neq("status", "missed"),
    client.from("leagues").select("players_per_team").eq("id", leagueId).maybeSingle(),
    client.from("players").select("id, player_profile, member_category, is_selectable"),
  ]);
  const settings: FantasySettings = {
    ...DEFAULT_FANTASY_SETTINGS,
    roleScoringActive: activeRound.settings_snapshot?.role_scoring_active !== false,
    goalPoints: Number(settingsRow?.goal_points ?? DEFAULT_FANTASY_SETTINGS.goalPoints),
    attackerGoalPoints: Number(settingsRow?.attacker_goal_points ?? DEFAULT_FANTASY_SETTINGS.attackerGoalPoints),
    assistPoints: Number(settingsRow?.assist_points ?? DEFAULT_FANTASY_SETTINGS.assistPoints),
    winPoints: Number(settingsRow?.win_points ?? DEFAULT_FANTASY_SETTINGS.winPoints),
    lossPoints: Number(settingsRow?.loss_points ?? DEFAULT_FANTASY_SETTINGS.lossPoints),
    goalkeeperLossPoints: Number(settingsRow?.goalkeeper_loss_points ?? DEFAULT_FANTASY_SETTINGS.goalkeeperLossPoints),
    goalkeeperAppearancePoints: Number(settingsRow?.goalkeeper_appearance_points ?? DEFAULT_FANTASY_SETTINGS.goalkeeperAppearancePoints),
    goalConcededPoints: Number(settingsRow?.goal_conceded_points ?? DEFAULT_FANTASY_SETTINGS.goalConcededPoints),
    teamGoalConcededPoints: Number(settingsRow?.team_goal_conceded_points ?? DEFAULT_FANTASY_SETTINGS.teamGoalConcededPoints),
    ownGoalPoints: Number(settingsRow?.own_goal_points ?? DEFAULT_FANTASY_SETTINGS.ownGoalPoints),
    captainMultiplier: Number(settingsRow?.captain_multiplier ?? DEFAULT_FANTASY_SETTINGS.captainMultiplier),
    topScorerPredictionPoints: Number(settingsRow?.top_scorer_prediction_points ?? DEFAULT_FANTASY_SETTINGS.topScorerPredictionPoints),
    topAssistPredictionPoints: Number(settingsRow?.top_assist_prediction_points ?? DEFAULT_FANTASY_SETTINGS.topAssistPredictionPoints),
  };
  const playerProfileById = new Map((playerRows || []).map((player: any) => [player.id, player.player_profile]));
  const eligiblePredictionPlayerIds = new Set<string>(
    (playerRows || [])
      .filter((player: any) => player.member_category === "player" && player.is_selectable)
      .map((player: any) => String(player.id)),
  );
  const stats = projectFantasyLiveStats(
    (matches || []).map((match: any) => ({
      id: match.id,
      status: match.status,
      teamAId: match.team_a_id,
      teamBId: match.team_b_id,
      scoreA: Number(match.score_a || 0),
      scoreB: Number(match.score_b || 0),
      players: (match.match_players || []).map((item: any) => ({ playerId: item.player_id, teamId: item.team_id, resultEligible: Boolean(item.result_eligible), playerProfile: playerProfileById.get(item.player_id) || null })),
      goalkeepers: (match.match_goalkeepers || []).map((item: any) => ({ playerId: item.player_id, teamId: item.team_id })),
      events: (match.match_events || []).map((item: any) => ({ playerId: item.player_id, assistPlayerId: item.assist_player_id, teamId: item.team_id, isOwnGoal: Boolean(item.is_own_goal) })),
    })),
    settings,
  );
  const maxPlayers = leagueRow?.players_per_team || 5;
    const projections = projectFantasyLiveLineups(
      (lineups || [])
        .filter((lineup: any) => lineup.captain_player_id && (lineup.fantasy_lineup_players || []).length === maxPlayers)
        .map((lineup: any) => ({
        id: lineup.id,
        userId: lineup.user_id,
        playerIds: (lineup.fantasy_lineup_players || []).map((player: any) => player.player_id),
        slots: (lineup.fantasy_lineup_players || [])
          .filter((player: any) => player.slot_role)
          .map((player: any) => ({
            playerId: player.player_id,
            slotRole: player.slot_role,
            playerProfile: player.player_profile_locked,
          })),
        captainPlayerId: lineup.captain_player_id,
        topScorerPlayerId: lineup.top_scorer_player_id,
        topAssistPlayerId: lineup.top_assist_player_id,
      })),
    stats,
    settings,
    eligiblePredictionPlayerIds,
  );
  return { roundId: activeRound.round_id, byUserId: new Map(projections.map((item) => [item.userId, item])) };
}

export async function getFantasyRanking(
  scope: "general" | "round" = "general",
  roundId?: string
) {
  const account = await getCurrentAccount();
  if (!account.user) return [];
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return [];
  const { data: fs } = await account.client
    .from("fantasy_seasons")
    .select("id")
    .eq("season_id", season.id)
    .maybeSingle();
  if (!fs) return [];

  const live = await getLiveRoundProjections(account.client, fs.id, league.id);

  let entries: any[] = [];
  if (scope === "round") {
    let fantasyRoundId: string | null = null;
    if (roundId) {
      const { data } = await account.client
        .from("fantasy_rounds")
        .select("id")
        .eq("fantasy_season_id", fs.id)
        .eq("round_id", roundId)
        .maybeSingle();
      fantasyRoundId = data?.id || null;
    } else {
      const { data } = await account.client
        .from("fantasy_rounds")
        .select("id, round:round_id(date, number)")
        .eq("fantasy_season_id", fs.id);
      fantasyRoundId =
        (data || []).sort((a: any, b: any) =>
          `${b.round?.date}-${b.round?.number}`.localeCompare(
            `${a.round?.date}-${a.round?.number}`
          )
        )[0]?.id || null;
    }
    if (live && (!roundId || roundId === live.roundId)) {
      entries = [...live.byUserId.values()].map((item) => ({
        id: item.lineupId,
        user_id: item.userId,
        total_points: item.totalPoints,
        current_budget: 0,
        rounds_played: 1,
        is_live: true,
      }));
    } else if (fantasyRoundId) {
      const { data } = await account.client
        .from("fantasy_lineups")
        .select("id, user_id, total_points, budget_after, budget_before, status")
        .eq("fantasy_round_id", fantasyRoundId)
        .in("status", ["locked", "scored"]);
      entries = (data || []).map((item: any) => ({
        ...item,
        current_budget: item.budget_after ?? item.budget_before,
        rounds_played: 1,
      }));
    }
  } else {
    const { data } = await account.client
      .from("fantasy_accounts")
      .select("*")
      .eq("fantasy_season_id", fs.id)
      .order("total_points", { ascending: false });
    entries = (data || []).map((item: any) => ({
      ...item,
      total_points: Number(item.total_points || 0) + (live?.byUserId.get(item.user_id)?.totalPoints || 0),
      is_live: Boolean(live?.byUserId.has(item.user_id)),
    }));
  }

  entries.sort((a: any, b: any) => Number(b.total_points) - Number(a.total_points));
  const userIds = entries.map((item: any) => item.user_id);
  const { data: profiles } = userIds.length
    ? await account.client
        .from("account_profiles")
        .select("user_id, players(name, avatar_url)")
        .in("user_id", userIds)
    : { data: [] as any[] };
  const profileByUser = new Map(
    (profiles || []).map((item: any) => [item.user_id, item.players])
  );
  let previousPoints: number | null = null;
  let previousPosition = 0;
  return entries.map((item: any, index: number) => {
    const points = Number(item.total_points || 0);
    const position = previousPoints === points ? previousPosition : index + 1;
    previousPoints = points;
    previousPosition = position;
    return { ...item, position, player: profileByUser.get(item.user_id) || null };
  });
}

export type FantasyLineupStatusEntry = {
  userId: string;
  playerName: string;
  avatarUrl: string | null;
  hasSaved: boolean;
  savedAt: string | null;
  points?: number | null;
  isCurrentUser: boolean;
};

export type FantasyRoundLineupOverview = {
  isRoundOpen: boolean;
  roundNumber?: number | null;
  roundDate?: string | null;
  roundId?: string | null;
  confirmedCount: number;
  pendingCount: number;
  confirmed: FantasyLineupStatusEntry[];
  pending: FantasyLineupStatusEntry[];
  ranking: any[];
};

export async function getFantasyRoundLineupOverview(
  roundId?: string
): Promise<FantasyRoundLineupOverview> {
  const account = await getCurrentAccount();
  if (!account.user) {
    return {
      isRoundOpen: false,
      confirmedCount: 0,
      pendingCount: 0,
      confirmed: [],
      pending: [],
      ranking: [],
    };
  }

  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) {
    return {
      isRoundOpen: false,
      confirmedCount: 0,
      pendingCount: 0,
      confirmed: [],
      pending: [],
      ranking: [],
    };
  }

  const { data: fs } = await account.client
    .from("fantasy_seasons")
    .select("id")
    .eq("season_id", season.id)
    .maybeSingle();

  if (!fs) {
    return {
      isRoundOpen: false,
      confirmedCount: 0,
      pendingCount: 0,
      confirmed: [],
      pending: [],
      ranking: [],
    };
  }

  const { data: fantasyRounds } = await account.client
    .from("fantasy_rounds")
    .select("id, market_status, round_id, round:round_id(id, number, date, status, round_type)")
    .eq("fantasy_season_id", fs.id);

  const officialFantasyRounds = (fantasyRounds || []).filter(
    (fr: any) => fr.round?.round_type === "official"
  );

  const sortedRounds = [...officialFantasyRounds].sort((a: any, b: any) =>
    `${b.round?.date || ""}-${String(b.round?.number || 0).padStart(4, "0")}`.localeCompare(
      `${a.round?.date || ""}-${String(a.round?.number || 0).padStart(4, "0")}`
    )
  );

  let targetFantasyRound: any = null;
  if (roundId) {
    targetFantasyRound =
      sortedRounds.find((fr: any) => fr.round_id === roundId || fr.id === roundId) || null;
  } else {
    targetFantasyRound =
      sortedRounds.find(
        (fr: any) => fr.market_status !== "finished" && fr.round?.status !== "finished"
      ) ||
      sortedRounds[0] ||
      null;
  }

  if (!targetFantasyRound) {
    return {
      isRoundOpen: false,
      confirmedCount: 0,
      pendingCount: 0,
      confirmed: [],
      pending: [],
      ranking: [],
    };
  }

  const isRoundOpen =
    targetFantasyRound.market_status === "open" &&
    targetFantasyRound.round?.status !== "finished";

  const ranking = await getFantasyRanking("round", targetFantasyRound.round?.id);

  if (!isRoundOpen) {
    return {
      isRoundOpen: false,
      roundNumber: targetFantasyRound.round?.number,
      roundDate: targetFantasyRound.round?.date,
      roundId: targetFantasyRound.round?.id,
      confirmedCount: ranking.length,
      pendingCount: 0,
      confirmed: [],
      pending: [],
      ranking,
    };
  }

  const [{ data: fantasyAccounts }, { data: allProfiles }, { data: lineups }] =
    await Promise.all([
      account.client.from("fantasy_accounts").select("user_id").eq("fantasy_season_id", fs.id),
      account.client
        .from("account_profiles")
        .select("user_id, players(name, avatar_url)")
        .not("player_id", "is", null),
      account.client
        .from("fantasy_lineups")
        .select("id, user_id, status, updated_at, created_at")
        .eq("fantasy_round_id", targetFantasyRound.id),
    ]);

  const lineupByUser = new Map((lineups || []).map((l: any) => [l.user_id, l]));
  const profileByUser = new Map(
    (allProfiles || []).map((p: any) => [p.user_id, p.players])
  );

  const allUserIds = new Set<string>([
    ...(fantasyAccounts || []).map((fa: any) => fa.user_id),
    ...(allProfiles || []).map((ap: any) => ap.user_id),
    ...(lineups || []).map((l: any) => l.user_id),
  ]);

  const confirmed: FantasyLineupStatusEntry[] = [];
  const pending: FantasyLineupStatusEntry[] = [];

  for (const userId of allUserIds) {
    const profile = profileByUser.get(userId);
    const playerName = (profile as any)?.name || "Cartoleiro";
    const avatarUrl = (profile as any)?.avatar_url || null;
    const lineup = lineupByUser.get(userId);
    const isCurrentUser = userId === account.user.id;

    if (lineup && lineup.status !== "missed") {
      confirmed.push({
        userId,
        playerName,
        avatarUrl,
        hasSaved: true,
        savedAt: lineup.updated_at || lineup.created_at || null,
        isCurrentUser,
      });
    } else {
      pending.push({
        userId,
        playerName,
        avatarUrl,
        hasSaved: false,
        savedAt: null,
        isCurrentUser,
      });
    }
  }

  confirmed.sort((a, b) => {
    if (a.savedAt && b.savedAt) return b.savedAt.localeCompare(a.savedAt);
    return a.playerName.localeCompare(b.playerName, "pt-BR");
  });

  pending.sort((a, b) => a.playerName.localeCompare(b.playerName, "pt-BR"));

  return {
    isRoundOpen: true,
    roundNumber: targetFantasyRound.round?.number,
    roundDate: targetFantasyRound.round?.date,
    roundId: targetFantasyRound.round?.id,
    confirmedCount: confirmed.length,
    pendingCount: pending.length,
    confirmed,
    pending,
    ranking,
  };
}

export async function updateFantasySettings(values: Partial<FantasySettings>) {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores." };
  const { attackerGoalPoints: _legacyAttackerGoalPoints, ownGoalPoints, lossPoints, goalkeeperLossPoints, goalkeeperAppearancePoints, goalConcededPoints, teamGoalConcededPoints, ...otherValues } = values;
  const { error } = await account.client.rpc("update_fantasy_settings", {
    p_settings: otherValues,
  });
  if (error) return { success: false, error: error.message };
  if (values.goalPoints !== undefined || ownGoalPoints !== undefined) {
    const { error: positionError } = await account.client.rpc("update_fantasy_attack_and_own_goal_points", {
      p_attacker_goal_points: values.goalPoints ?? DEFAULT_FANTASY_SETTINGS.goalPoints,
      p_own_goal_points: ownGoalPoints ?? DEFAULT_FANTASY_SETTINGS.ownGoalPoints,
    });
    if (positionError) return { success: false, error: positionError.message };
  }
  if (lossPoints !== undefined) {
    const { error: lossError } = await account.client.rpc("update_fantasy_loss_points", {
      p_loss_points: lossPoints,
    });
    if (lossError) return { success: false, error: lossError.message };
  }
  if (goalkeeperLossPoints !== undefined) {
    const { error: goalkeeperLossError } = await account.client.rpc("update_fantasy_goalkeeper_loss_points", {
      p_goalkeeper_loss_points: goalkeeperLossPoints,
    });
    if (goalkeeperLossError) return { success: false, error: goalkeeperLossError.message };
  }
  if (
    goalkeeperAppearancePoints !== undefined ||
    goalConcededPoints !== undefined ||
    teamGoalConcededPoints !== undefined
  ) {
    const { error: goalkeeperError } = await account.client.rpc("update_fantasy_goalkeeper_points", {
      p_goalkeeper_appearance_points: goalkeeperAppearancePoints ?? DEFAULT_FANTASY_SETTINGS.goalkeeperAppearancePoints,
      p_goal_conceded_points: goalConcededPoints ?? DEFAULT_FANTASY_SETTINGS.goalConcededPoints,
      p_team_goal_conceded_points: teamGoalConcededPoints ?? DEFAULT_FANTASY_SETTINGS.teamGoalConcededPoints,
    });
    if (goalkeeperError) return { success: false, error: goalkeeperError.message };
  }
  revalidatePath("/admin/cartola");
  revalidatePath("/cartola");
  return { success: true };
}

export async function reprocessFantasyRound(roundId: string) {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores." };
  const { error } = await account.client.rpc("reprocess_fantasy_from_round", {
    p_round_id: roundId,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/cartola", "layout");
  return { success: true };
}

export async function reprocessFantasyRoundWithCurrentRules(roundId: string) {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores." };

  // Primeiro recompõe os dados esportivos. As correções manuais persistentes,
  // como um jogador zerado na rodada, são respeitadas por este cálculo.
  const { calculateRoundStats } = await import("./stats");
  const statsResult = await calculateRoundStats(roundId);
  if (!statsResult.success) {
    return {
      success: false,
      error: `Não foi possível recalcular as estatísticas: ${statsResult.error || "erro desconhecido"}`,
    };
  }

  const { data, error } = await account.client.rpc("reprocess_fantasy_with_current_rules", {
    p_round_id: roundId,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/cartola");
  revalidatePath("/cartola", "layout");
  revalidatePath("/ranking");
  revalidatePath(`/rodadas/${roundId}`);
  revalidatePath("/jogadores", "layout");
  revalidatePath("/");

  const result = data as { affected_finished_rounds?: number } | null;
  return {
    success: true,
    affectedRounds: Number(result?.affected_finished_rounds || 1),
  };
}

export async function getFantasyAdminData() {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return null;
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  const { data: settings } = await account.client
    .from("fantasy_settings")
    .select("*")
    .eq("league_id", league.id)
    .maybeSingle();
  const { data: rounds } = await account.client
    .from("fantasy_rounds")
    .select("id, market_status, processed_at, rules_version, scoring_version, round:round_id(id, number, date, status, round_type)")
    .order("created_at", { ascending: false })
    .limit(20);
  const [{ data: testSession }, { data: friendlyRounds }] = await Promise.all([
    account.client
      .from("fantasy_test_sessions")
      .select(
        "*, round:round_id(id, number, date, start_time, status, round_type, round_players(count), matches(id, status, started_at))"
      )
      .eq("league_id", league.id)
      .maybeSingle(),
    season
      ? account.client
          .from("rounds")
          .select(
            "id, number, date, start_time, status, round_type, round_players(count), matches(id, status, started_at)"
          )
          .eq("league_id", league.id)
          .eq("season_id", season.id)
          .eq("round_type", "friendly")
          .order("date", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  return {
    settings: settings || {
      currency_name: DEFAULT_FANTASY_SETTINGS.currencyName,
      initial_budget: DEFAULT_FANTASY_SETTINGS.initialBudget,
      initial_player_price: DEFAULT_FANTASY_SETTINGS.initialPlayerPrice,
      min_player_price: DEFAULT_FANTASY_SETTINGS.minPlayerPrice,
      max_player_price: DEFAULT_FANTASY_SETTINGS.maxPlayerPrice,
      goal_points: DEFAULT_FANTASY_SETTINGS.goalPoints,
      assist_points: DEFAULT_FANTASY_SETTINGS.assistPoints,
      win_points: DEFAULT_FANTASY_SETTINGS.winPoints,
      loss_points: DEFAULT_FANTASY_SETTINGS.lossPoints,
      goalkeeper_loss_points: DEFAULT_FANTASY_SETTINGS.goalkeeperLossPoints,
      goalkeeper_appearance_points: DEFAULT_FANTASY_SETTINGS.goalkeeperAppearancePoints,
      goal_conceded_points: DEFAULT_FANTASY_SETTINGS.goalConcededPoints,
      team_goal_conceded_points: DEFAULT_FANTASY_SETTINGS.teamGoalConcededPoints,
      captain_multiplier: DEFAULT_FANTASY_SETTINGS.captainMultiplier,
      top_scorer_prediction_points: DEFAULT_FANTASY_SETTINGS.topScorerPredictionPoints,
      top_assist_prediction_points: DEFAULT_FANTASY_SETTINGS.topAssistPredictionPoints,
      top_team_prediction_points: DEFAULT_FANTASY_SETTINGS.topTeamPredictionPoints,
      king_of_wins_points: DEFAULT_FANTASY_SETTINGS.kingOfWinsPoints,
      mvp_prediction_points: DEFAULT_FANTASY_SETTINGS.mvpPredictionPoints,
      bet_of_round_points: DEFAULT_FANTASY_SETTINGS.betOfRoundPoints,
      bet_rank_band_1: DEFAULT_FANTASY_SETTINGS.betRequiredRanks[0],
      bet_rank_band_2: DEFAULT_FANTASY_SETTINGS.betRequiredRanks[1],
      bet_rank_band_3: DEFAULT_FANTASY_SETTINGS.betRequiredRanks[2],
      bet_rank_band_4: DEFAULT_FANTASY_SETTINGS.betRequiredRanks[3],
      score_goal_reward_band_1: DEFAULT_FANTASY_SETTINGS.scoreGoalRewards[0],
      score_goal_reward_band_2: DEFAULT_FANTASY_SETTINGS.scoreGoalRewards[1],
      score_goal_reward_band_3: DEFAULT_FANTASY_SETTINGS.scoreGoalRewards[2],
      score_goal_reward_band_4: DEFAULT_FANTASY_SETTINGS.scoreGoalRewards[3],
      recent_weight: DEFAULT_FANTASY_SETTINGS.recentWeight,
      win_rate_weight: DEFAULT_FANTASY_SETTINGS.winRateWeight,
      historical_weight: DEFAULT_FANTASY_SETTINGS.historicalWeight,
      consistency_weight: DEFAULT_FANTASY_SETTINGS.consistencyWeight,
      smoothing_games: DEFAULT_FANTASY_SETTINGS.smoothingGames,
      max_price_increase: DEFAULT_FANTASY_SETTINGS.maxPriceIncrease,
      max_price_decrease: DEFAULT_FANTASY_SETTINGS.maxPriceDecrease,
      min_sample_for_radar: DEFAULT_FANTASY_SETTINGS.minSampleForRadar,
    },
    rounds: rounds || [],
    testSession: testSession || null,
    friendlyRounds: friendlyRounds || [],
  };
}

export async function createFantasyTestSession(roundId: string) {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores." };
  const { error } = await account.client.rpc("create_fantasy_test_session", {
    p_round_id: roundId,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/cartola");
  revalidatePath("/cartola", "layout");
  return { success: true };
}

export async function processFantasyTestSession(roundId: string) {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores." };
  const { error } = await account.client.rpc("process_fantasy_test_round", {
    p_round_id: roundId,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/cartola");
  revalidatePath("/cartola", "layout");
  return { success: true };
}

export async function resetFantasyTestSession(roundId: string) {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores." };
  const { error } = await account.client.rpc("reset_fantasy_test_session", {
    p_round_id: roundId,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/cartola");
  revalidatePath("/cartola", "layout");
  return { success: true };
}

export async function getFantasyPlayerSummary(playerId: string) {
  return getFantasyPlayerDetail(playerId);
}

export async function getMyFantasySummary() {
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const ranking = await getFantasyRanking();
  return ranking.find((item: any) => item.user_id === account.user!.id) || null;
}

export async function getMyFantasyHistory() {
  const account = await getCurrentAccount();
  if (!account.user) return [];
  const { data } = await account.client
    .from("fantasy_lineups")
    .select("*, fantasy_rounds(round_id, market_status, rounds(number, date))")
    .eq("user_id", account.user.id)
    .order("created_at", { ascending: false });
  return data || [];
}

export type FantasyQuickHighlight = {
  topScorer: { name: string; avatarUrl: string | null; points: number } | null;
  topGain: { name: string; avatarUrl: string | null; variation: number; priceChange: number } | null;
  topDrop: { name: string; avatarUrl: string | null; variation: number; priceChange: number } | null;
};

export type FantasyLiveProjection = {
  isLive: boolean;
  calculatedAt: string;
  playerPoints: Array<{ playerId: string; points: number }>;
  currentUser: FantasyLiveLineupProjection | null;
};

export type SeasonPassEvent = {
  id: string;
  eventType: "participation" | "valid_lineup" | "full_round" | "remote_full_round" | "goals_assists_cycle" | "participation_streak" | "active_week_streak" | "lineup_streak";
  houses: number;
  roundId: string | null;
  roundNumber: number | null;
  roundDate: string | null;
  createdAt: string;
};

export type SeasonPassDashboard = {
  authenticated: boolean;
  available: boolean;
  progress: number;
  maxProgress: 40;
  mode: "athlete" | "community";
  participations: number;
  activeWeeks: number;
  validLineups: number;
  goalsAssistsRemainder: number;
  nextMilestone: number | null;
  playerName: string | null;
  playerAvatarUrl: string | null;
  events: SeasonPassEvent[];
};

/** Dados leves da trilha do Passe BQ. A regra e calculada no banco ao fechar a rodada. */
export async function getSeasonPassDashboard(): Promise<SeasonPassDashboard> {
  const account = await getCurrentAccount();
  const empty: SeasonPassDashboard = {
    authenticated: Boolean(account.user), available: false, progress: 0, maxProgress: 40,
    mode: "athlete", participations: 0, activeWeeks: 0, validLineups: 0, goalsAssistsRemainder: 0,
    nextMilestone: 1, playerName: null, playerAvatarUrl: null, events: [],
  };
  if (!account.user || !account.profile?.player_id) return empty;

  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return empty;

  const [{ data: fantasySeason, error: seasonError }, { data: player }] = await Promise.all([
    account.client.from("fantasy_seasons").select("id").eq("season_id", season.id).maybeSingle(),
    account.client.from("players").select("name, avatar_url, member_category").eq("id", account.profile.player_id).maybeSingle(),
  ]);
  if (seasonError || !fantasySeason) return empty;

  const { data: pass, error: passError } = await account.client
    .from("fantasy_season_passes")
    .select("progress, progression_mode, participations, active_weeks, valid_lineups, goals_assists_remainder")
    .eq("fantasy_season_id", fantasySeason.id)
    .eq("user_id", account.user.id)
    .maybeSingle();

  // Enquanto a migration 060 nao estiver aplicada, o restante do app segue utilizavel.
  if (passError) return empty;

  const { data: rows, error: eventsError } = await account.client
    .from("fantasy_season_pass_events")
    .select("id, event_type, houses, source_round_id, created_at, rounds:source_round_id(number, date)")
    .eq("fantasy_season_id", fantasySeason.id)
    .eq("user_id", account.user.id)
    .order("created_at", { ascending: false })
    .limit(8);
  if (eventsError) return empty;

  const mode = pass?.progression_mode === "community" || player?.member_category === "wag" || player?.member_category === "supporter"
    ? "community" as const
    : "athlete" as const;
  const progress = Number(pass?.progress || 0);
  const milestones = [1, 5, 10, 18, 25, 32, 40];

  return {
    authenticated: true,
    available: true,
    progress,
    maxProgress: 40,
    mode,
    participations: Number(pass?.participations || 0),
    activeWeeks: Number(pass?.active_weeks || 0),
    validLineups: Number(pass?.valid_lineups || 0),
    goalsAssistsRemainder: Number(pass?.goals_assists_remainder || 0),
    nextMilestone: milestones.find((milestone) => milestone > progress) ?? null,
    playerName: player?.name || null,
    playerAvatarUrl: player?.avatar_url || null,
    events: (rows || []).map((row: any) => ({
      id: row.id,
      eventType: row.event_type,
      houses: Number(row.houses),
      roundId: row.source_round_id || null,
      roundNumber: row.rounds?.number ?? null,
      roundDate: row.rounds?.date ?? null,
      createdAt: row.created_at,
    })),
  };
}

export async function getFantasyUserHistory(userId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return null;
  const { data: fantasySeason } = await account.client
    .from("fantasy_seasons")
    .select("id")
    .eq("season_id", season.id)
    .maybeSingle();
  if (!fantasySeason) return null;
  const [{ data: profile }, { data: fantasyAccount }, { data: lineups }] = await Promise.all([
    account.client.from("account_profiles").select("user_id, players(name, avatar_url)").eq("user_id", userId).maybeSingle(),
    account.client.from("fantasy_accounts").select("total_points, current_budget, rounds_played, best_round_points").eq("fantasy_season_id", fantasySeason.id).eq("user_id", userId).maybeSingle(),
    account.client
      .from("fantasy_lineups")
      .select("id, total_points, player_points, prediction_points, budget_after, captain_player_id, top_scorer_player_id, top_assist_player_id, score_breakdown, fantasy_rounds!inner(round_id, market_status, settings_snapshot, rounds!inner(number, date, status))")
      .eq("user_id", userId)
      .eq("fantasy_rounds.fantasy_season_id", fantasySeason.id)
      .eq("status", "scored")
      .order("created_at", { ascending: false }),
  ]);
  if (!profile || !fantasyAccount) return null;
  return {
    userId,
    player: profile.players,
    account: {
      totalPoints: Number(fantasyAccount.total_points || 0),
      currentBudget: Number(fantasyAccount.current_budget || 0),
      roundsPlayed: Number(fantasyAccount.rounds_played || 0),
      bestRoundPoints: Number(fantasyAccount.best_round_points || 0),
    },
    lineups: (lineups || []).map((lineup: any) => ({
      ...lineup,
      fantasyRound: lineup.fantasy_rounds,
      round: lineup.fantasy_rounds?.rounds,
    })),
  };
}

export async function getFantasyUserRoundHistory(userId: string, roundId: string) {
  const history = await getFantasyUserHistory(userId);
  if (!history) return null;
  const target = history.lineups.find((lineup: any) => lineup.fantasyRound?.round_id === roundId);
  if (!target) return null;
  const account = await getCurrentAccount();
  const { data: lineup } = await account.client
    .from("fantasy_lineups")
    .select("*, fantasy_lineup_players(*, players(name, avatar_url))")
    .eq("id", target.id)
    .eq("status", "scored")
    .maybeSingle();
  if (!lineup) return null;
  const playerIds = (lineup.fantasy_lineup_players || []).map((item: any) => item.player_id);
  const { data: stats } = playerIds.length
    ? await account.client
      .from("player_round_stats")
      .select("player_id, games, goals, assists, wins, draws, losses, own_goals, goalkeeper_games, clean_sheets, goals_conceded, defensive_clean_games, defensive_one_goal_games, team_goals_conceded")
      .eq("round_id", roundId)
      .in("player_id", playerIds)
    : { data: [] };
  const predictionIds = [lineup.top_scorer_player_id, lineup.top_assist_player_id].filter(Boolean) as string[];
  const { data: predictionPlayers } = predictionIds.length
    ? await account.client.from("players").select("id, name, avatar_url").in("id", predictionIds)
    : { data: [] };
  return {
    history,
    lineup,
    round: target.round,
    settingsSnapshot: target.fantasyRound?.settings_snapshot || {},
    statsByPlayer: Object.fromEntries((stats || []).map((stat: any) => [stat.player_id, stat])),
    predictionPlayers: Object.fromEntries((predictionPlayers || []).map((player: any) => [player.id, player])),
  };
}

export async function getFantasyQuickHighlights(): Promise<FantasyQuickHighlight | null> {
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return null;
  const { data: fs } = await account.client
    .from("fantasy_seasons")
    .select("id")
    .eq("season_id", season.id)
    .maybeSingle();
  if (!fs) return null;

  const { data: prices } = await account.client
    .from("fantasy_player_prices")
    .select(
      "player_id, current_price, last_round_points, last_price_change, variation_rate, players(name, avatar_url)"
    )
    .eq("fantasy_season_id", fs.id);

  if (!prices || prices.length === 0) return null;

  const validPrices = prices.map((item: any) => ({
    name: item.players?.name || "Jogador",
    avatarUrl: item.players?.avatar_url || null,
    points: Number(item.last_round_points || 0),
    priceChange: Number(item.last_price_change || 0),
    variation: Number(item.variation_rate || 0),
  }));

  const sortedPoints = [...validPrices].sort((a, b) => b.points - a.points);
  const sortedGain = [...validPrices].sort((a, b) => b.variation - a.variation);
  const sortedDrop = [...validPrices].sort((a, b) => a.variation - b.variation);

  return {
    topScorer: sortedPoints[0]?.points > 0 ? sortedPoints[0] : null,
    topGain: sortedGain[0]?.variation > 0 ? sortedGain[0] : null,
    topDrop: sortedDrop[0]?.variation < 0 ? sortedDrop[0] : null,
  };
}
