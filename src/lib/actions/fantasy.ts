"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveLeague } from "./rounds";
import { getActiveSeason } from "./seasons";
import { DEFAULT_FANTASY_SETTINGS, getFantasyInitialBudget, type FantasySettings } from "@/lib/fantasy/config";
import {
  calculateCostBenefit,
  calculateExpectedFantasyPoints,
  calculateFantasyForm,
  calculateFantasyPredictionIndex,
  calculateFantasyPlayerPoints,
  calculateFantasyTrend,
  calculateMarketPopularity,
  getFantasyPlayerTags,
  type FantasyFormLevel,
  type FantasyTagItem,
  type FantasyTrend,
} from "@/lib/fantasy/engine";
import type { FantasyChallengeType } from "@/lib/fantasy/challenges";
import { getAllPlayersEquippedCosmeticsMap, type EquippedCosmeticsSummary } from "./cosmetics";
import {
  projectFantasyLiveLineups,
  projectFantasyLiveStats,
  type FantasyLiveLineupProjection,
  type FantasyLivePlayerStats,
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
  expectedPoints: number;
  popularityPercent: number;
  selectionCount: number;
  previousSelectionCount: number;
  previousPopularityPercent: number;
  marketShareDelta: number;
  captainPercent: number;
  buyersDelta: number;
  hasPreviousHistory: boolean;
  allTags: FantasyTagItem[];
  compactTags: FantasyTagItem[];
  cosmetics: Pick<EquippedCosmeticsSummary, "frameKey" | "auraKey" | "backgroundAssetKey"> | null;
};

export type FantasyRadarHighlight = {
  player: FantasyMarketPlayer;
  value: string;
  extra?: string;
  badge?: string;
};

export type FantasyRadarTopList = {
  title: string;
  subtitle: string;
  players: FantasyRadarHighlight[];
  contextLabel: "Rodada anterior" | "Próxima rodada" | "Rodada em andamento";
};

export type FantasyRadarComparison = {
  leader: FantasyRadarHighlight;
  challenger: FantasyRadarHighlight;
  metric: string;
  copy: string;
};

export type FantasyRadarWithdrawal = {
  id: string;
  playerId: string | null;
  playerName: string;
  occurredAt: string;
  player: FantasyMarketPlayer | null;
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
  topLists: {
    mostSelected: FantasyRadarTopList | null;
    mostCaptained: FantasyRadarTopList | null;
    favoriteScorers: FantasyRadarTopList | null;
    favoriteAssists: FantasyRadarTopList | null;
    goalkeepers: FantasyRadarTopList | null;
    topValuation: FantasyRadarTopList | null;
    topDepreciation: FantasyRadarTopList | null;
    bestCostBenefit: FantasyRadarTopList | null;
    bestForm: FantasyRadarTopList | null;
    mostBought: FantasyRadarTopList | null;
    mostSold: FantasyRadarTopList | null;
    previousRoundGoals: FantasyRadarTopList | null;
    previousRoundAssists: FantasyRadarTopList | null;
    previousRoundEfficiency: FantasyRadarTopList | null;
    previousRoundDefense: FantasyRadarTopList | null;
  };
  comparison: FantasyRadarComparison | null;
  latestWithdrawal: FantasyRadarWithdrawal | null;
  totalLineups: number;
  hasMinSample: boolean;
};

export type FantasyDashboardInsights = {
  topRoundPlayer: (FantasyMarketPlayer & { selectionCount?: number }) | null;
  mostSelectedPlayer: (FantasyMarketPlayer & { selectionCount: number }) | null;
  topValuationPlayer: FantasyMarketPlayer | null;
  topDepreciationPlayer: FantasyMarketPlayer | null;
};

async function loadFantasyMatchSnapshots(client: any, roundId: string | null) {
  if (!roundId) return [] as any[];

  const { data: matches, error: matchesError } = await client
    .from("matches")
    .select("id, status, team_a_id, team_b_id, score_a, score_b")
    .eq("round_id", roundId);
  if (matchesError) {
    console.error("Erro ao buscar partidas para a prévia do Cartola:", matchesError);
    return [] as any[];
  }

  const matchIds = (matches || []).map((match: any) => match.id);
  if (matchIds.length === 0) return [] as any[];

  const [eventsResult, playersResult, goalkeepersResult] = await Promise.all([
    client
      .from("match_events")
      .select("match_id, event_type, player_id, assist_player_id, team_id, is_own_goal")
      .in("match_id", matchIds)
      .eq("event_type", "goal"),
    client
      .from("match_players")
      .select("match_id, player_id, team_id, result_eligible")
      .in("match_id", matchIds),
    client
      .from("match_goalkeepers")
      .select("match_id, player_id, team_id")
      .in("match_id", matchIds),
  ]);

  if (eventsResult.error) console.error("Erro ao buscar gols para a prévia do Cartola:", eventsResult.error);
  if (playersResult.error) console.error("Erro ao buscar participantes para a prévia do Cartola:", playersResult.error);
  if (goalkeepersResult.error) console.error("Erro ao buscar goleiros para a prévia do Cartola:", goalkeepersResult.error);

  const groupByMatch = (rows: any[] | null) => {
    const grouped = new Map<string, any[]>();
    for (const row of rows || []) {
      const current = grouped.get(row.match_id) || [];
      current.push(row);
      grouped.set(row.match_id, current);
    }
    return grouped;
  };
  const eventsByMatch = groupByMatch(eventsResult.data);
  const playersByMatch = groupByMatch(playersResult.data);
  const goalkeepersByMatch = groupByMatch(goalkeepersResult.data);

  return (matches || []).map((match: any) => ({
    ...match,
    match_events: eventsByMatch.get(match.id) || [],
    match_players: playersByMatch.get(match.id) || [],
    match_goalkeepers: goalkeepersByMatch.get(match.id) || [],
  }));
}

export async function getFantasyDashboard() {
  const account = await getCurrentAccount();
  if (!account.user) return { authenticated: false as const };

  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return { authenticated: true as const, available: false as const };
  const playersPerTeam = league.players_per_team || 5;

  // Estas leituras dependem apenas de liga/temporada. Iniciá-las juntas
  // remove um round-trip inteiro antes de montar o dashboard do Cartola.
  const [{ data: settingsRow }, { data: testSession }, { data: fantasySeason }] = await Promise.all([
    account.client
      .from("fantasy_settings")
      .select("*")
      .eq("league_id", league.id)
      .maybeSingle(),
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
      "*, round:round_id(id, number, date, start_time, status, round_type, preparation_stage, ignore_goalkeeper_stats, teams(id, name, color), matches(id, status))"
    )
    .eq("fantasy_season_id", fantasySeason.id);

  const officialFantasyRounds = (fantasyRoundRows || []).filter(
    (item: any) => item.round?.round_type === "official"
  );
  const byRoundDateDesc = (a: any, b: any) =>
    `${b.round?.date || ""}-${String(b.round?.number || 0).padStart(4, "0")}`.localeCompare(
      `${a.round?.date || ""}-${String(a.round?.number || 0).padStart(4, "0")}`
    );

  const selectedActiveOfficialRound =
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
  const activeOfficialRound = selectedActiveOfficialRound &&
    selectedActiveOfficialRound.market_status === "open" &&
    (selectedActiveOfficialRound.round?.matches || []).some((match: any) =>
      match.status === "live" || match.status === "finished"
    )
      ? { ...selectedActiveOfficialRound, market_status: "in_progress" }
      : selectedActiveOfficialRound;

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
        captainMultiplier: Number(
          scoringSnapshot.captain_multiplier ?? settings.captainMultiplier,
        ),
        topScorerPredictionPoints: Number(
          scoringSnapshot.top_scorer_prediction_points ?? settings.topScorerPredictionPoints,
        ),
        topAssistPredictionPoints: Number(
          scoringSnapshot.top_assist_prediction_points ?? settings.topAssistPredictionPoints,
        ),
        topTeamPredictionPoints: Number(
          scoringSnapshot.top_team_prediction_points ?? settings.topTeamPredictionPoints,
        ),
      }
    : settings;
  const displayRound = fantasyRound?.round || latestFinishedRound?.round || null;
  const displayRoundId = displayRound?.id || null;
  const officialRoundIds = officialFantasyRounds.map((item: any) => item.round?.id).filter(Boolean);
  const matchIds = (displayRound?.matches || []).map((match: any) => match.id);

  // Cartas não bloqueiam mais o início das consultas de mercado/escalação.
  // O resultado continua sendo aguardado antes do retorno final da página.
  const cardDashboardRequest = (async () => {
    try {
      const { getMyPacks, getMyInventoryCount, getActiveCardForRound } = await import("./fantasy-cards");
      const [packsRes, inventoryCount, activeCard] = await Promise.all([
        getMyPacks(),
        getMyInventoryCount(),
        displayRoundId ? getActiveCardForRound(displayRoundId) : Promise.resolve(null),
      ]);
      return {
        availablePacks: packsRes.availablePacks,
        availablePacksCount: packsRes.availablePacks.length,
        inventoryCount,
        activeCard,
      };
    } catch (err) {
      console.error("Erro ao carregar dados V3 das cartas:", err);
      return { availablePacks: [] as any[], availablePacksCount: 0, inventoryCount: 0, activeCard: null as any };
    }
  })();

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

  // O cliente de serviço permanece somente no servidor. Ele também recupera
  // as escalações quando uma partida começou mas o status do mercado ficou
  // indevidamente como `open` no banco.
  const liveReadClient = createServiceClient() || account.client;

  // Buscar escalações da rodada ativa para popularidade em tempo real
  const activeRoundLineupsRequest = activeOfficialRound
    ? liveReadClient
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
        .eq("status", "scored")
    : Promise.resolve({ data: [] as any[] });

  // A prévia é pública para quem já está no Cartola, mas precisa continuar
  // funcionando caso uma regra de RLS da escalação/rodada seja atualizada.
  const liveMatchesRequest = loadFantasyMatchSnapshots(liveReadClient, displayRoundId);
  const playerCosmeticsRequest = getAllPlayersEquippedCosmeticsMap();

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
    liveMatches,
    cardDashboard,
    playerCosmetics,
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
          .select("user_id, status, captain_player_id, top_scorer_player_id, top_assist_player_id, fantasy_lineup_players(player_id)")
          .eq("fantasy_round_id", latestFinishedRound.id)
          .eq("status", "scored")
      : Promise.resolve({ data: [] as any[] }),
    activeRoundLineupsRequest,
    previousRoundLineupsRequest,
    portfolioRequest,
    liveMatchesRequest,
    cardDashboardRequest,
    playerCosmeticsRequest,
  ]);

  const { availablePacks, availablePacksCount, inventoryCount, activeCard } = cardDashboard;

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
    { ignoreGoalkeeperStats: Boolean(displayRound?.ignore_goalkeeper_stats) },
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
  const recentVariationsByPlayer = new Map<string, number[]>();
  const recentPointsByPlayer = new Map<string, number[]>();

  for (const row of priceHistory || []) {
    const belongsToLatestFinishedRound = latestFinishedRound
      ? row.fantasy_round_id === latestFinishedRound.id
      : true;
    if (belongsToLatestFinishedRound && !lastVariation.has(row.player_id)) {
      lastVariation.set(row.player_id, Number(row.variation_rate || 0));
      lastPriceChange.set(
        row.player_id,
        Number(row.price_change ?? Number(row.price_after || 0) - Number(row.price_before || 0))
      );
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
  const latestLineupByUser = new Map(
    (latestRoundLineups || []).map((lineup: any) => [lineup.user_id, lineup] as const),
  );
  const currentLineupsFormatted = (
    activeOfficialRound ? activeRoundLineups : latestRoundLineups
  )?.filter((l: any) => (l.fantasy_lineup_players || []).length === playersPerTeam)
    .map((l: any) => {
    const latestSavedLineup = latestLineupByUser.get(l.user_id) as any;
    return {
      userId: l.user_id,
      playerIds: (l.fantasy_lineup_players || []).map((p: any) => p.player_id),
      // Quando a nova rodada ainda herdou apenas os jogadores do portfólio,
      // preservamos as escolhas da última escalação até o usuário alterá-las.
      captainPlayerId: l.captain_player_id || latestSavedLineup?.captain_player_id || null,
      topScorerPlayerId: l.top_scorer_player_id || latestSavedLineup?.top_scorer_player_id || null,
      topAssistPlayerId: l.top_assist_player_id || latestSavedLineup?.top_assist_player_id || null,
    };
  }) || [];

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
      // A pontuação da última rodada vem diretamente das estatísticas daquela
      // rodada. O histórico de preços é só uma consequência da apuração e,
      // em bases migradas, pode ter o campo round_points zerado.
      const roundPoints = calculateFantasyPlayerPoints(
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
      const expectedPoints = calculateExpectedFantasyPoints({
        seasonAverage: avgPoints,
        recentPoints: playerRecentPoints,
      });
      const costBenefit = calculateCostBenefit(expectedPoints, price);
      const popularity = popularityAgg.getPopularity(player.id);
      const cosmetics = playerCosmetics.get(player.id);

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
        expectedPoints,
        popularityPercent: popularity.percent,
        selectionCount: popularity.count,
        previousSelectionCount: popularity.previousCount,
        previousPopularityPercent: popularity.previousPercent,
        marketShareDelta: popularity.marketShareDelta,
        captainPercent: popularity.captainPercent,
        buyersDelta: popularity.buyersDelta,
        hasPreviousHistory: popularity.hasHistory,
        allTags,
        compactTags,
        cosmetics: cosmetics
          ? {
              frameKey: cosmetics.frameKey,
              auraKey: cosmetics.auraKey,
              backgroundAssetKey: cosmetics.backgroundAssetKey,
            }
          : null,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name, "pt-BR"));

  let effectiveLineup: any =
    lineup ||
    (betweenRounds && latestLineup
      ? latestLineup
      : rawPortfolio
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
    .filter((p) => p.roundsPlayed >= 1 && p.expectedPoints > 0)
    .sort((a, b) => b.costBenefitRatio - a.costBenefitRatio || b.expectedPoints - a.expectedPoints);
  const sortedByForm = [...market]
    .filter((p) => p.recentPointsList.length >= 1)
    .sort((a, b) => {
      const sumA = a.recentPointsList.slice(0, 3).reduce((x, y) => x + y, 0);
      const sumB = b.recentPointsList.slice(0, 3).reduce((x, y) => x + y, 0);
      return sumB - sumA;
    });
  const sortedByBought = [...market]
    .filter((p) => popularityAgg.hasComparableSample && p.marketShareDelta > 0)
    .sort((a, b) => b.marketShareDelta - a.marketShareDelta || b.selectionCount - a.selectionCount);
  const sortedBySold = [...market]
    .filter((p) => popularityAgg.hasComparableSample && p.marketShareDelta < 0)
    .sort((a, b) => a.marketShareDelta - b.marketShareDelta || a.selectionCount - b.selectionCount);

  const marketById = new Map(market.map((player) => [player.id, player] as const));
  const rankPlayersByCount = (counts: Map<string, number>) =>
    [...counts.entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || (marketById.get(a[0])?.name || "").localeCompare(marketById.get(b[0])?.name || "", "pt-BR"))
      .map(([playerId]) => marketById.get(playerId))
      .filter((player): player is FantasyMarketPlayer => Boolean(player));

  const selectedCandidates = rankPlayersByCount(popularityAgg.selectionCounts);
  const captainCandidates = rankPlayersByCount(popularityAgg.captainCounts);

  const predictionCandidates = market.filter((player) => player.games > 0 || player.roundsPlayed > 0);
  const goalsPerGame = (player: FantasyMarketPlayer) => player.goals / Math.max(1, player.games);
  const assistsPerGame = (player: FantasyMarketPlayer) => player.assists / Math.max(1, player.games);
  const averageFantasyPoints = (player: FantasyMarketPlayer) => player.totalPoints / Math.max(1, player.roundsPlayed);
  const maxGoalAverage = Math.max(0, ...predictionCandidates.map(goalsPerGame));
  const maxAssistAverage = Math.max(0, ...predictionCandidates.map(assistsPerGame));
  const maxPointsAverage = Math.max(0, ...predictionCandidates.map(averageFantasyPoints));
  const goalPotential = (player: FantasyMarketPlayer) => calculateFantasyPredictionIndex({
    primaryPerGame: goalsPerGame(player),
    averagePoints: averageFantasyPoints(player),
    maxPrimaryPerGame: maxGoalAverage,
    maxAveragePoints: maxPointsAverage,
  });
  const assistPotential = (player: FantasyMarketPlayer) => calculateFantasyPredictionIndex({
    primaryPerGame: assistsPerGame(player),
    averagePoints: averageFantasyPoints(player),
    maxPrimaryPerGame: maxAssistAverage,
    maxAveragePoints: maxPointsAverage,
  });
  const scorerCandidates = [...predictionCandidates].sort(
    (a, b) => goalPotential(b) - goalPotential(a) || b.totalPoints - a.totalPoints,
  );
  const assistCandidates = [...predictionCandidates].sort(
    (a, b) => assistPotential(b) - assistPotential(a) || b.totalPoints - a.totalPoints,
  );
  const goalkeeperCandidates = [...market]
    .filter((player) => (player.isGoalkeeper || player.goalkeeperGames > 0) && player.goalkeeperGames > 0)
    .sort(
      (a, b) =>
        (a.goalkeeperConcededAverage ?? Number.POSITIVE_INFINITY) -
          (b.goalkeeperConcededAverage ?? Number.POSITIVE_INFINITY) ||
        b.goalkeeperGames - a.goalkeeperGames ||
        b.totalPoints - a.totalPoints,
    );
  const marketContextLabel: FantasyRadarTopList["contextLabel"] = fantasyRound?.market_status === "in_progress"
    ? "Rodada em andamento"
    : "Próxima rodada";
  const makeTopList = (
    title: string,
    subtitle: string,
    players: FantasyMarketPlayer[],
    getValue: (player: FantasyMarketPlayer) => string,
    getExtra: (player: FantasyMarketPlayer) => string,
    contextLabel: FantasyRadarTopList["contextLabel"] = marketContextLabel,
  ): FantasyRadarTopList | null => {
    const topPlayers = players.slice(0, 3).map((player) => ({
      player,
      value: getValue(player),
      extra: getExtra(player),
    }));
    // Mesmo com uma amostra pequena, o líder ainda é útil no cartão recolhido.
    // O componente informa com clareza quando ainda não há 2º e 3º lugar.
    return topPlayers.length >= 1 ? { title, subtitle, players: topPlayers, contextLabel } : null;
  };

  const latestFinishedRoundId = latestFinishedRound?.round?.id || null;
  const latestRoundStatsByPlayer = new Map(
    (statRows || [])
      .filter((row: any) => row.round_id === latestFinishedRoundId)
      .map((row: any) => [row.player_id, row] as const),
  );
  const latestRoundPlayers = market
    .map((player) => ({ player, stats: latestRoundStatsByPlayer.get(player.id) }))
    .filter((item): item is { player: FantasyMarketPlayer; stats: any } => Boolean(item.stats));
  const makePreviousRoundTopList = (
    title: string,
    subtitle: string,
    players: Array<{ player: FantasyMarketPlayer; stats: any }>,
    getValue: (item: { player: FantasyMarketPlayer; stats: any }) => string,
    getExtra: (item: { player: FantasyMarketPlayer; stats: any }) => string,
  ): FantasyRadarTopList | null => {
    if (!latestFinishedRoundId) return null;
    const topPlayers = players.slice(0, 3).map((item) => ({
      player: item.player,
      value: getValue(item),
      extra: getExtra(item),
    }));
    return topPlayers.length ? { title, subtitle, players: topPlayers, contextLabel: "Rodada anterior" } : null;
  };

  const previousRoundGoals = makePreviousRoundTopList(
    "Artilheiros da rodada",
    "Quem mais balançou a rede na rodada anterior.",
    latestRoundPlayers
      .filter((item) => Number(item.stats.goals || 0) > 0)
      .sort((a, b) => Number(b.stats.goals || 0) - Number(a.stats.goals || 0)),
    (item) => `${Number(item.stats.goals)} gol${Number(item.stats.goals) === 1 ? "" : "s"}`,
    (item) => `${Number(item.stats.games || 0)} jogo${Number(item.stats.games || 0) === 1 ? "" : "s"} na rodada`,
  );
  const previousRoundAssists = makePreviousRoundTopList(
    "Garçons da rodada",
    "Quem mais serviu os companheiros na rodada anterior.",
    latestRoundPlayers
      .filter((item) => Number(item.stats.assists || 0) > 0)
      .sort((a, b) => Number(b.stats.assists || 0) - Number(a.stats.assists || 0)),
    (item) => `${Number(item.stats.assists)} assistência${Number(item.stats.assists) === 1 ? "" : "s"}`,
    (item) => `${Number(item.stats.games || 0)} jogo${Number(item.stats.games || 0) === 1 ? "" : "s"} na rodada`,
  );
  const previousRoundEfficiency = makePreviousRoundTopList(
    "Melhor aproveitamento",
    "Percentual de vitórias dos atletas que entraram em campo na rodada anterior.",
    latestRoundPlayers
      .filter((item) => Number(item.stats.games || 0) > 0)
      .sort((a, b) => Number(b.stats.wins || 0) / Number(b.stats.games || 1) - Number(a.stats.wins || 0) / Number(a.stats.games || 1)),
    (item) => `${((Number(item.stats.wins || 0) / Number(item.stats.games || 1)) * 100).toFixed(0)}%`,
    (item) => `${Number(item.stats.wins || 0)} vitória${Number(item.stats.wins || 0) === 1 ? "" : "s"} em ${Number(item.stats.games || 0)} jogo${Number(item.stats.games || 0) === 1 ? "" : "s"}`,
  );
  const previousRoundDefense = makePreviousRoundTopList(
    "Melhor defesa",
    "Menor média de gols sofridos por quem foi para o gol na rodada anterior.",
    latestRoundPlayers
      .filter((item) => Number(item.stats.goalkeeper_games || 0) > 0)
      .sort((a, b) => Number(a.stats.goals_conceded || 0) / Number(a.stats.goalkeeper_games || 1) - Number(b.stats.goals_conceded || 0) / Number(b.stats.goalkeeper_games || 1)),
    (item) => `${(Number(item.stats.goals_conceded || 0) / Number(item.stats.goalkeeper_games || 1)).toFixed(2)} G/J`,
    (item) => `${Number(item.stats.goals_conceded || 0)} gol${Number(item.stats.goals_conceded || 0) === 1 ? "" : "s"} sofrido${Number(item.stats.goals_conceded || 0) === 1 ? "" : "s"}`,
  );

  const topLists = {
    mostSelected: makeTopList(
      "Mais escalados",
      "A turma está apostando nestes nomes.",
      selectedCandidates,
      (player) => `${player.popularityPercent}%`,
      () => "das escalações",
    ),
    mostCaptained: makeTopList(
      "Capitães da rodada",
      "As braçadeiras mais confiadas pelos cartoleiros.",
      captainCandidates,
      (player) => `${player.captainPercent}%`,
      () => "das braçadeiras",
    ),
    favoriteScorers: makeTopList(
      "Potencial de gol",
      "Índice estimado: 70% média de gols e 30% pontuação média geral.",
      scorerCandidates,
      (player) => `${goalPotential(player)}/100`,
      (player) => `${goalsPerGame(player).toFixed(2)} gol/j · ${averageFantasyPoints(player).toFixed(1)} pts/j`,
    ),
    favoriteAssists: makeTopList(
      "Potencial de assistência",
      "Índice estimado: 70% média de assistências e 30% pontuação média geral.",
      assistCandidates,
      (player) => `${assistPotential(player)}/100`,
      (player) => `${assistsPerGame(player).toFixed(2)} ast/j · ${averageFantasyPoints(player).toFixed(1)} pts/j`,
    ),
    goalkeepers: makeTopList(
      "Paredões",
      "Quem fecha o gol sem pedir VAR.",
      goalkeeperCandidates,
      (player) => `${(player.goalkeeperConcededAverage ?? 0).toFixed(2)} G/J`,
      (player) => `${player.goalkeeperGames} jogo(s) no gol`,
    ),
    topValuation: makeTopList(
      "Maiores valorizações",
      "Quem mais colocou cartoleta no bolso.",
      sortedByValuation,
      (player) => `+C$ ${player.priceChange.toFixed(2)}`,
      (player) => `+${(player.variation * 100).toFixed(1)}% de valorização`,
    ),
    topDepreciation: makeTopList(
      "Maiores desvalorizações",
      "Os preços que mais sentiram a rodada.",
      sortedByDepreciation,
      (player) => `-C$ ${Math.abs(player.priceChange).toFixed(2)}`,
      (player) => `${(player.variation * 100).toFixed(1)}% de variação`,
    ),
    bestCostBenefit: makeTopList(
      "Melhores custo-benefício",
      "Projeção de forma recente + média da temporada dividida pelo preço atual.",
      sortedByCostBenefit,
      (player) => `${player.expectedPoints.toFixed(1)} pts`,
      (player) => `C$ ${player.price.toFixed(2)} · ${player.costBenefitFormatted}`,
    ),
    bestForm: makeTopList(
      "Melhores em forma",
      "Quem chega mais quente pelas rodadas recentes.",
      sortedByForm,
      (player) => `${player.recentPointsList.slice(0, 3).reduce((sum, value) => sum + value, 0).toFixed(1)} pts`,
      () => "nas últimas rodadas",
    ),
    mostBought: makeTopList(
      "Mais comprados",
      `Quem mais ganhou espaço: rodada anterior × ${popularityAgg.totalLineups} escalações completas atuais.`,
      sortedByBought,
      (player) => `+${player.marketShareDelta.toFixed(1)} p.p.`,
      (player) => `${player.selectionCount}/${popularityAgg.totalLineups} agora · ${player.previousPopularityPercent}% antes`,
    ),
    mostSold: makeTopList(
      "Mais vendidos",
      `Quem mais perdeu espaço: rodada anterior × ${popularityAgg.totalLineups} escalações completas atuais.`,
      sortedBySold,
      (player) => `${player.marketShareDelta.toFixed(1)} p.p.`,
      (player) => `${player.selectionCount}/${popularityAgg.totalLineups} agora · ${player.previousPopularityPercent}% antes`,
    ),
    previousRoundGoals,
    previousRoundAssists,
    previousRoundEfficiency,
    previousRoundDefense,
  };

  const formLeader = sortedByForm[0];
  const formChallenger = sortedByForm[1];
  const formLeaderScore = formLeader?.recentPointsList.slice(0, 3).reduce((sum, value) => sum + value, 0) || 0;
  const formChallengerScore = formChallenger?.recentPointsList.slice(0, 3).reduce((sum, value) => sum + value, 0) || 0;
  const comparison: FantasyRadarComparison | null = formLeader && formChallenger
    ? {
        leader: { player: formLeader, value: `${formLeaderScore.toFixed(1)} pts`, extra: "nas últimas rodadas" },
        challenger: { player: formChallenger, value: `${formChallengerScore.toFixed(1)} pts`, extra: "nas últimas rodadas" },
        metric: "Forma recente",
        copy: `${formLeader.name} leva ${Math.max(0, formLeaderScore - formChallengerScore).toFixed(1)} ponto(s) de vantagem. Hoje a bola parece reconhecer o crachá dele.`,
      }
    : null;

  const { data: withdrawalRows } = await (account.client as any)
    .from("callup_withdrawals")
    .select("id, player_id, player_name, occurred_at")
    .eq("league_id", league.id)
    .order("occurred_at", { ascending: false })
    .limit(1);
  const withdrawalRow = withdrawalRows?.[0];
  const latestWithdrawal: FantasyRadarWithdrawal | null = withdrawalRow
    ? {
        id: withdrawalRow.id,
        playerId: withdrawalRow.player_id,
        playerName: withdrawalRow.player_name,
        occurredAt: withdrawalRow.occurred_at,
        player: market.find((player) => player.id === withdrawalRow.player_id) || null,
      }
    : null;

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
          value: `${sortedByCostBenefit[0].expectedPoints.toFixed(1)} pts`,
          extra: `C$ ${sortedByCostBenefit[0].price.toFixed(2)} · ${sortedByCostBenefit[0].costBenefitFormatted}`,
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
          value: `+${sortedByBought[0].marketShareDelta.toFixed(1)} p.p.`,
          extra: `${sortedByBought[0].selectionCount}/${popularityAgg.totalLineups} agora · ${sortedByBought[0].previousPopularityPercent}% antes`,
          badge: "Mais Comprado",
        }
      : null,
    mostSold: sortedBySold[0]
      ? {
          player: sortedBySold[0],
          value: `${sortedBySold[0].marketShareDelta.toFixed(1)} p.p.`,
          extra: `${sortedBySold[0].selectionCount}/${popularityAgg.totalLineups} agora · ${sortedBySold[0].previousPopularityPercent}% antes`,
          badge: "Mais Vendido",
        }
      : null,
    favoriteScorer: scorerCandidates[0]
      ? {
          player: scorerCandidates[0],
          value: `${goalPotential(scorerCandidates[0])}/100`,
          extra: `${goalsPerGame(scorerCandidates[0]).toFixed(2)} gol/j`,
          badge: "Potencial de Gol",
        }
      : null,
    favoriteAssist: assistCandidates[0]
      ? {
          player: assistCandidates[0],
          value: `${assistPotential(assistCandidates[0])}/100`,
          extra: `${assistsPerGame(assistCandidates[0]).toFixed(2)} ast/j`,
          badge: "Potencial de Assistência",
        }
      : null,
    topLists,
    comparison,
    latestWithdrawal,
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

  // A leitura individual acima é a fonte da escalação exibida na tela. Ela
  // tem prioridade sobre a listagem geral: em bancos com dados antigos a
  // relação aninhada da listagem podia chegar vazia e zerar só o dono dela.
  const projectionLineups = (activeRoundLineups || []).filter(
    (item: any) => item.user_id !== account.user!.id,
  );
  if (
    fantasyRound?.market_status === "in_progress" &&
    effectiveLineup?.fantasy_lineup_players?.length
  ) {
    projectionLineups.push({
      id: effectiveLineup.id || `preview-${account.user.id}`,
      user_id: account.user.id,
      status: effectiveLineup.status || "preview",
      captain_player_id: effectiveLineup.captain_player_id,
      top_scorer_player_id: effectiveLineup.top_scorer_player_id,
      top_assist_player_id: effectiveLineup.top_assist_player_id,
      fantasy_lineup_players: effectiveLineup.fantasy_lineup_players,
    });
  }

  const projectedLineups = fantasyRound?.market_status === "in_progress"
    ? projectFantasyLiveLineups(
        projectionLineups
          // Bancos que fecharam uma escalação de 6 atletas com a função antiga
          // podem ter gravado `missed` por engano. A existência dos jogadores
          // salvos é a fonte segura para a prévia; escalações realmente vazias
          // continuam fora da projeção.
          .filter((item: any) => (item.fantasy_lineup_players || []).length > 0)
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
    playerStats: [...liveStats.values()],
    currentUser: projectedLineups.find((item) => item.userId === account.user!.id) || null,
  };

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
          cardPoints: Number(latestLineup?.score_breakdown?.cardBonus || 0),
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
    if (input.roundId && (input.playerIds.length !== maxPlayers || !input.captainId)) {
      return { success: false, error: `Para salvar a escalação, escolha exatamente ${maxPlayers} jogadores e um capitão.` };
    }
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

  // Depois do fechamento a revelação é coletiva. O cliente de serviço evita
  // que uma política de RLS reduza silenciosamente a consulta à escalação do
  // usuário atual.
  const revealedReadClient = createServiceClient() || account.client;

  // Buscar todas as escalações com jogadores travados e snapshots. Também
  // aceitamos o estado legado `missed` quando há atletas salvos: a função de
  // fechamento antiga considerava apenas times de 5 e marcou times de 6 assim.
  const { data: rawLineupRows } = await revealedReadClient
    .from("fantasy_lineups")
    .select(
      `
      id, user_id, status, captain_player_id, top_scorer_player_id, top_assist_player_id, challenge_player_id,
      player_points, prediction_points, total_points, round_position,
      fantasy_lineup_players (
        id, player_id, price_locked, price_after, base_points, position_bonus, captain_bonus, total_points,
        player_name_locked, avatar_url_locked
      )
    `
    )
    .eq("fantasy_round_id", targetFantasyRound.id);

  const rawLineups = (rawLineupRows || []).filter(
    (lineup: any) => (lineup.fantasy_lineup_players || []).length > 0,
  );

  const userIds = (rawLineups || []).map((l: any) => l.user_id);
  const { data: profiles } = userIds.length
    ? await revealedReadClient
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
    ? await revealedReadClient.from("players").select("id, name, avatar_url").in("id", allPredictIds)
    : { data: [] as any[] };

  const predictedMap = new Map((predictedPlayers || []).map((p: any) => [p.id, p]));

  const { data: activations } = userIds.length
    ? await revealedReadClient
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
        positionBonus: Number(lp.position_bonus || 0),
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
    { data: cosmeticProfileRow },
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
    account.client
      .from("account_profiles")
      .select("user_id")
      .eq("player_id", playerId)
      .maybeSingle(),
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
  const expectedPoints = calculateExpectedFantasyPoints({ seasonAverage: avgPoints, recentPoints: recentPointsList });
  const costBenefit = calculateCostBenefit(expectedPoints, price);

  const gkGames = stats.goalkeeperGames || 0;
  const gkConceded = stats.goalsConceded || 0;

  // A ficha do atleta também mostra os scouts que ainda não foram
  // consolidados. A consulta usa a mesma fonte da prévia ao vivo para que o
  // detalhe acompanhe a pontuação exibida no mercado.
  const liveReadClient = createServiceClient() || account.client;
  const cosmeticLoadoutPromise = cosmeticProfileRow?.user_id
    ? account.client
      .from("fantasy_user_cosmetic_loadouts")
      .select("banner:banner_cosmetic_id(asset_key), frame:frame_cosmetic_id(asset_key)")
      .eq("user_id", cosmeticProfileRow.user_id)
      .eq("fantasy_season_id", fs.id)
      .maybeSingle()
    : Promise.resolve({ data: null });
  const [{ data: liveRoundRows }, { data: liveSettingsRow }, { data: cosmeticLoadout }] = await Promise.all([
    liveReadClient
      .from("fantasy_rounds")
      .select("id, round_id, market_status, settings_snapshot, round:round_id(number, status, ignore_goalkeeper_stats)")
      .eq("fantasy_season_id", fs.id)
      .eq("market_status", "in_progress"),
    liveReadClient
      .from("fantasy_settings")
      .select("*")
      .eq("league_id", league.id)
      .maybeSingle(),
    cosmeticLoadoutPromise,
  ]);
  const liveRound = (liveRoundRows || []).find((item: any) => {
    const round = Array.isArray(item.round) ? item.round[0] : item.round;
    return round?.status !== "finished";
  }) || null;
  const liveRoundInfo = Array.isArray(liveRound?.round) ? liveRound.round[0] : liveRound?.round;
  let liveRoundSummary: any = null;

  if (liveRound?.round_id) {
    const snapshot = liveRound.settings_snapshot || {};
    const liveSettings: FantasySettings = {
      ...DEFAULT_FANTASY_SETTINGS,
      roleScoringActive: snapshot.role_scoring_active !== false,
      goalPoints: Number(snapshot.goal_points ?? liveSettingsRow?.goal_points ?? DEFAULT_FANTASY_SETTINGS.goalPoints),
      attackerGoalPoints: Number(snapshot.attacker_goal_points ?? liveSettingsRow?.attacker_goal_points ?? DEFAULT_FANTASY_SETTINGS.attackerGoalPoints),
      assistPoints: Number(snapshot.assist_points ?? liveSettingsRow?.assist_points ?? DEFAULT_FANTASY_SETTINGS.assistPoints),
      winPoints: Number(snapshot.win_points ?? liveSettingsRow?.win_points ?? DEFAULT_FANTASY_SETTINGS.winPoints),
      lossPoints: Number(snapshot.loss_points ?? liveSettingsRow?.loss_points ?? DEFAULT_FANTASY_SETTINGS.lossPoints),
      goalkeeperLossPoints: Number(snapshot.goalkeeper_loss_points ?? liveSettingsRow?.goalkeeper_loss_points ?? DEFAULT_FANTASY_SETTINGS.goalkeeperLossPoints),
      goalkeeperAppearancePoints: Number(snapshot.goalkeeper_appearance_points ?? liveSettingsRow?.goalkeeper_appearance_points ?? DEFAULT_FANTASY_SETTINGS.goalkeeperAppearancePoints),
      goalConcededPoints: Number(snapshot.goal_conceded_points ?? liveSettingsRow?.goal_conceded_points ?? DEFAULT_FANTASY_SETTINGS.goalConcededPoints),
      teamGoalConcededPoints: Number(snapshot.team_goal_conceded_points ?? liveSettingsRow?.team_goal_conceded_points ?? DEFAULT_FANTASY_SETTINGS.teamGoalConcededPoints),
      ownGoalPoints: Number(snapshot.own_goal_points ?? liveSettingsRow?.own_goal_points ?? DEFAULT_FANTASY_SETTINGS.ownGoalPoints),
      captainMultiplier: Number(snapshot.captain_multiplier ?? liveSettingsRow?.captain_multiplier ?? DEFAULT_FANTASY_SETTINGS.captainMultiplier),
    };
    const liveMatches = await loadFantasyMatchSnapshots(liveReadClient, liveRound.round_id);
    const playerProfile = playerRow.player_profile as "offensive" | "midfield" | "defensive" | null;
    const liveStats = projectFantasyLiveStats(
      liveMatches.map((match: any) => ({
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
          playerProfile: item.player_id === playerId ? playerProfile : null,
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
      liveSettings,
      { ignoreGoalkeeperStats: Boolean(liveRoundInfo?.ignore_goalkeeper_stats) },
    );
    const current = liveStats.get(playerId) || {
      goals: 0, assists: 0, ownGoals: 0, wins: 0, losses: 0,
      goalkeeperGames: 0, goalsConceded: 0, defensiveCleanGames: 0,
      defensiveOneGoalGames: 0, teamGoalsConceded: 0, basePoints: 0,
    };
    const goalValue = liveSettings.roleScoringActive === false && playerProfile === "offensive"
      ? liveSettings.attackerGoalPoints
      : liveSettings.goalPoints;
    const defensiveBonus = liveSettings.roleScoringActive === false
      ? 0
      : (playerProfile === "defensive"
        ? current.defensiveCleanGames * 2 + current.defensiveOneGoalGames
        : 0);
    const concededValue = liveSettings.roleScoringActive === false
      ? current.teamGoalsConceded * liveSettings.teamGoalConcededPoints
      : current.goalsConceded * liveSettings.goalConcededPoints;
    const breakdown = [
      { key: "goals", label: "Gols", count: current.goals, unitPoints: goalValue, points: current.goals * goalValue, icon: "⚽" },
      { key: "assists", label: "Assistências", count: current.assists, unitPoints: liveSettings.assistPoints, points: current.assists * liveSettings.assistPoints, icon: "👟" },
      { key: "wins", label: "Vitórias", count: current.wins, unitPoints: liveSettings.winPoints, points: current.wins * liveSettings.winPoints, icon: "🏆" },
      { key: "losses", label: "Derrotas", count: current.losses, unitPoints: liveSettings.lossPoints, points: current.losses * liveSettings.lossPoints, icon: "❌" },
      { key: "goalkeeper_games", label: "Jogos no Gol (Rodízio)", count: current.goalkeeperGames, unitPoints: liveSettings.goalkeeperAppearancePoints, points: current.goalkeeperGames * liveSettings.goalkeeperAppearancePoints, icon: "🧤" },
      { key: "goals_conceded", label: "Gols Sofridos no Gol", count: liveSettings.roleScoringActive === false ? current.teamGoalsConceded : current.goalsConceded, unitPoints: liveSettings.goalConcededPoints, points: concededValue, icon: "🛡️" },
      { key: "defensive_bonus", label: "Bônus Defensivo (SG)", count: current.defensiveCleanGames + current.defensiveOneGoalGames, unitPoints: 2, points: defensiveBonus, icon: "🔒" },
      { key: "own_goals", label: "Gols Contra", count: current.ownGoals, unitPoints: liveSettings.ownGoalPoints, points: current.ownGoals * liveSettings.ownGoalPoints, icon: "⚠️" },
    ].filter((item) => item.count > 0);

    const matchesBreakdown = (liveMatches || [])
      .filter((match: any) => {
        const inPlayers = (match.match_players || []).some((p: any) => p.player_id === playerId);
        const inGk = (match.match_goalkeepers || []).some((g: any) => g.player_id === playerId);
        return inPlayers || inGk;
      })
      .map((match: any, index: number) => {
        const isFinished = match.status === "finished";
        const playerInMatch = (match.match_players || []).find((p: any) => p.player_id === playerId);
        const isGk = (match.match_goalkeepers || []).some((g: any) => g.player_id === playerId);
        const teamId = playerInMatch?.team_id || (match.match_goalkeepers || []).find((g: any) => g.player_id === playerId)?.team_id;
        const myTeam = teamId === match.team_a_id ? "A" : teamId === match.team_b_id ? "B" : null;
        const myScore = myTeam === "A" ? Number(match.score_a || 0) : Number(match.score_b || 0);
        const oppScore = myTeam === "A" ? Number(match.score_b || 0) : Number(match.score_a || 0);
        const isDraw = myScore === oppScore;
        const isWin = isFinished && !isDraw && myScore > oppScore;
        const isLoss = isFinished && !isDraw && myScore < oppScore;
        const matchGoals = (match.match_events || []).filter((e: any) => e.player_id === playerId && !e.is_own_goal).length;
        const matchAssists = (match.match_events || []).filter((e: any) => e.assist_player_id === playerId).length;
        const matchOwnGoals = (match.match_events || []).filter((e: any) => e.player_id === playerId && e.is_own_goal).length;
        
        return {
          matchId: match.id,
          matchIndex: index + 1,
          status: match.status,
          scoreFormatted: `${match.score_a ?? 0} x ${match.score_b ?? 0}`,
          myScore,
          oppScore,
          result: isFinished ? (isWin ? "win" : isLoss ? "loss" : "draw") : "live",
          goals: matchGoals,
          assists: matchAssists,
          ownGoals: matchOwnGoals,
          isGoalkeeper: isGk,
          goalsConcededInMatch: isGk ? oppScore : 0,
        };
      });

    const rulesList = [
      { label: "Gol marcado", unitPoints: goalValue, icon: "⚽", description: playerProfile === "offensive" ? "Pontuação padrão para atacante" : "Pontuação por gol marcado" },
      { label: "Assistência", unitPoints: liveSettings.assistPoints, icon: "👟", description: "Passe direto para gol" },
      { label: "Vitória na partida", unitPoints: liveSettings.winPoints, icon: "🏆", description: "Time vence a partida (ao encerrar)" },
      { label: "Derrota na partida", unitPoints: liveSettings.lossPoints, icon: "❌", description: "Time perde a partida (ao encerrar)" },
      { label: "Jogar no gol (rodízio)", unitPoints: liveSettings.goalkeeperAppearancePoints, icon: "🧤", description: "Bônus por atuar na posição de goleiro" },
      { label: "Gol sofrido no gol", unitPoints: liveSettings.goalConcededPoints, icon: "🛡️", description: "Penalidade por cada gol sofrido no gol" },
      { label: "Gol contra", unitPoints: liveSettings.ownGoalPoints, icon: "⚠️", description: "Penalidade por marcar gol contra" },
      ...(playerProfile === "defensive" ? [
        { label: "SG Defensivo (0 gols)", unitPoints: 2, icon: "🔒", description: "Bônus de zagueiro por partida sem sofrer gols" },
        { label: "SG Defensivo (1 gol)", unitPoints: 1, icon: "🛡️", description: "Bônus de zagueiro por partida com no máximo 1 gol sofrido" },
      ] : []),
    ];

    liveRoundSummary = {
      roundNumber: liveRoundInfo?.number || null,
      stats: current,
      basePoints: current.basePoints,
      breakdown,
      matchesBreakdown,
      rulesList,
    };
  }

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
    expectedPoints,
    recentPointsList,
    allTags,
    compactTags,
    history,
    liveRound: liveRoundSummary,
    cosmetics: {
      bannerAssetKey: (cosmeticLoadout as any)?.banner?.asset_key || null,
      frameKey: (cosmeticLoadout as any)?.frame?.asset_key || null,
    },
  };
}

async function getLiveRoundProjections(
  client: any,
  fantasySeasonId: string,
  leagueId: string,
  targetRoundId?: string,
) {
  // Mantém o ranking e a ficha individual na mesma fonte confiável da prévia
  // principal. O fallback preserva o funcionamento em ambientes de teste sem
  // chave de serviço configurada.
  let liveReadClient = createServiceClient() || client;
  const readActiveRounds = (readClient: any) => {
    let query = readClient
      .from("fantasy_rounds")
      .select("id, round_id, market_status, settings_snapshot, round:round_id(status, ignore_goalkeeper_stats, date, number)")
      .eq("fantasy_season_id", fantasySeasonId);
    if (targetRoundId) {
      // Uma página histórica pode precisar reconstruir uma rodada já encerrada
      // quando a consolidação deixou uma escalação antiga zerada.
      query = query.eq("round_id", targetRoundId);
    } else {
      // Sem alvo explícito, somente a rodada corrente entra no ranking geral.
      query = query.in("market_status", ["open", "in_progress"]);
    }
    return query;
  };
  let { data: activeRoundRows, error: activeRoundError } = await readActiveRounds(liveReadClient);
  // Uma chave de serviço incompleta não pode esconder a prévia de todos os
  // outros usuários. As políticas autenticadas já permitem ler essa rodada
  // após o fechamento, então repetimos a leitura com a sessão atual.
  if (activeRoundError && liveReadClient !== client) {
    console.error("Leitura de serviço da prévia do Cartola falhou; usando sessão autenticada:", activeRoundError.message);
    liveReadClient = client;
    ({ data: activeRoundRows, error: activeRoundError } = await readActiveRounds(liveReadClient));
  }
  if (activeRoundError) {
    console.error("Não foi possível localizar a rodada da prévia do Cartola:", activeRoundError.message);
    return null;
  }
  const linkedRound = (item: any) => Array.isArray(item?.round) ? item.round[0] || null : item?.round || null;
  const activeRound = (activeRoundRows || [])
    .filter((item: any) => Boolean(targetRoundId) || linkedRound(item)?.status !== "finished")
    .sort((a: any, b: any) => {
      if (a.market_status !== b.market_status) return a.market_status === "in_progress" ? -1 : 1;
      return `${linkedRound(b)?.date || ""}-${String(linkedRound(b)?.number || 0).padStart(4, "0")}`.localeCompare(
        `${linkedRound(a)?.date || ""}-${String(linkedRound(a)?.number || 0).padStart(4, "0")}`,
      );
    })[0] || null;
  if (!activeRound?.round_id) return null;
  const activeRoundInfo = linkedRound(activeRound);

  const [{ data: settingsRow }, matches, { data: lineups }, { data: playerRows }] = await Promise.all([
    liveReadClient.from("fantasy_settings").select("*").eq("league_id", leagueId).maybeSingle(),
    loadFantasyMatchSnapshots(liveReadClient, activeRound.round_id),
    liveReadClient
      .from("fantasy_lineups")
      .select("id, user_id, status, score_breakdown, captain_player_id, top_scorer_player_id, top_assist_player_id, fantasy_lineup_players(player_id, slot_role, player_profile_locked)")
      .eq("fantasy_round_id", activeRound.id),
    liveReadClient.from("players").select("id, player_profile, member_category, is_selectable"),
  ]);
  // A prévia precisa usar as regras congeladas quando a rodada foi aberta.
  // As configurações da liga podem mudar depois, mas não podem alterar uma
  // rodada que já está valendo — nem deixar ranking e tela do time divergirem.
  const snapshot = activeRound.settings_snapshot || {};
  const settings: FantasySettings = {
    ...DEFAULT_FANTASY_SETTINGS,
    roleScoringActive: snapshot.role_scoring_active !== false,
    goalPoints: Number(snapshot.goal_points ?? settingsRow?.goal_points ?? DEFAULT_FANTASY_SETTINGS.goalPoints),
    attackerGoalPoints: Number(snapshot.attacker_goal_points ?? settingsRow?.attacker_goal_points ?? DEFAULT_FANTASY_SETTINGS.attackerGoalPoints),
    assistPoints: Number(snapshot.assist_points ?? settingsRow?.assist_points ?? DEFAULT_FANTASY_SETTINGS.assistPoints),
    winPoints: Number(snapshot.win_points ?? settingsRow?.win_points ?? DEFAULT_FANTASY_SETTINGS.winPoints),
    lossPoints: Number(snapshot.loss_points ?? settingsRow?.loss_points ?? DEFAULT_FANTASY_SETTINGS.lossPoints),
    goalkeeperLossPoints: Number(snapshot.goalkeeper_loss_points ?? settingsRow?.goalkeeper_loss_points ?? DEFAULT_FANTASY_SETTINGS.goalkeeperLossPoints),
    goalkeeperAppearancePoints: Number(snapshot.goalkeeper_appearance_points ?? settingsRow?.goalkeeper_appearance_points ?? DEFAULT_FANTASY_SETTINGS.goalkeeperAppearancePoints),
    goalConcededPoints: Number(snapshot.goal_conceded_points ?? settingsRow?.goal_conceded_points ?? DEFAULT_FANTASY_SETTINGS.goalConcededPoints),
    teamGoalConcededPoints: Number(snapshot.team_goal_conceded_points ?? settingsRow?.team_goal_conceded_points ?? DEFAULT_FANTASY_SETTINGS.teamGoalConcededPoints),
    ownGoalPoints: Number(snapshot.own_goal_points ?? settingsRow?.own_goal_points ?? DEFAULT_FANTASY_SETTINGS.ownGoalPoints),
    captainMultiplier: Number(snapshot.captain_multiplier ?? settingsRow?.captain_multiplier ?? DEFAULT_FANTASY_SETTINGS.captainMultiplier),
    topScorerPredictionPoints: Number(snapshot.top_scorer_prediction_points ?? settingsRow?.top_scorer_prediction_points ?? DEFAULT_FANTASY_SETTINGS.topScorerPredictionPoints),
    topAssistPredictionPoints: Number(snapshot.top_assist_prediction_points ?? settingsRow?.top_assist_prediction_points ?? DEFAULT_FANTASY_SETTINGS.topAssistPredictionPoints),
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
    { ignoreGoalkeeperStats: Boolean(activeRoundInfo?.ignore_goalkeeper_stats) },
  );
  const projections = projectFantasyLiveLineups(
      (lineups || [])
        // A prévia precisa aparecer para toda escalação salva. Validações de
        // mercado continuam impedindo uma escalação incompleta de ser
        // consolidada, mas não escondemos o usuário inteiro do ranking ao vivo
        // por divergência antiga no tamanho configurado do time.
        .filter((lineup: any) => (lineup.fantasy_lineup_players || []).length > 0)
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
        cardBonus: Number(lineup.score_breakdown?.cardBonus || 0),
      })),
    stats,
    settings,
    eligiblePredictionPlayerIds,
  );
  return {
    roundId: activeRound.round_id,
    isLive: activeRound.market_status !== "finished" && activeRoundInfo?.status !== "finished",
    byUserId: new Map(projections.map((item) => [item.userId, item])),
  };
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

  // A classificação é coletiva. Em produção, as políticas de RLS podem
  // esconder escalações de terceiros do cliente comum, então a leitura
  // agregada precisa acontecer no servidor.
  const rankingReadClient = createServiceClient() || account.client;
  // Para o ranking geral basta a rodada ativa. No escopo de rodada a leitura
  // é feita depois de resolver o alvo, evitando projetar pontos de outra
  // rodada que esteja aberta ao mesmo tempo.
  let live = scope === "general"
    ? await getLiveRoundProjections(account.client, fs.id, league.id)
    : null;

  let entries: any[] = [];
  if (scope === "round") {
    let fantasyRoundId: string | null = null;
    let resolvedRoundId: string | null = roundId || null;
    if (roundId) {
      const { data } = await rankingReadClient
        .from("fantasy_rounds")
        .select("id")
        .eq("fantasy_season_id", fs.id)
        .eq("round_id", roundId)
        .maybeSingle();
      fantasyRoundId = data?.id || null;
    } else {
      const { data } = await rankingReadClient
        .from("fantasy_rounds")
        .select("id, round_id, market_status, round:round_id(date, number, status)")
        .eq("fantasy_season_id", fs.id);
      const ordered = [...(data || [])].sort((a: any, b: any) => {
        // Uma rodada em jogo sempre vence uma rodada futura ainda aberta.
        // Sem isso o ranking consultava a próxima rodada vazia.
        if (a.market_status !== b.market_status) {
          return a.market_status === "in_progress" ? -1 : b.market_status === "in_progress" ? 1 : 0;
        }
        return `${b.round?.date}-${b.round?.number}`.localeCompare(
          `${a.round?.date}-${a.round?.number}`,
        );
      });
      // A aba de rodada sempre prioriza a rodada que está aberta ou em jogo,
      // mesmo se já houver uma rodada futura criada no calendário.
      const latest = ordered.find((item: any) =>
        item.round?.status !== "finished" && ["open", "in_progress"].includes(item.market_status)
      ) || ordered[0];
      fantasyRoundId = latest?.id || null;
      resolvedRoundId = latest?.round_id || null;
    }
    live = await getLiveRoundProjections(
      account.client,
      fs.id,
      league.id,
      resolvedRoundId || undefined,
    );
    let persistedLineups: any[] = [];
    if (fantasyRoundId) {
      const { data } = await rankingReadClient
        .from("fantasy_lineups")
        .select("id, user_id, total_points, budget_after, budget_before, status, fantasy_lineup_players(player_id)")
        .eq("fantasy_round_id", fantasyRoundId);
      persistedLineups = (data || []).filter(
        (lineup: any) => (lineup.fantasy_lineup_players || []).length > 0,
      );
    }

    const isTargetLive = Boolean(live && (!roundId || roundId === live.roundId));
    if (isTargetLive) {
      // A projeção calcula os pontos lance a lance. Os registros persistidos
      // são um fallback para não deixar a tabela vazia caso uma escalação
      // antiga esteja sem filhos, ou uma leitura chegue antes do realtime.
      const byUserId = new Map<string, any>();
      for (const lineup of persistedLineups) {
        const projection = live!.byUserId.get(lineup.user_id);
        byUserId.set(lineup.user_id, {
          ...lineup,
          round_id: live!.roundId,
          total_points: projection?.totalPoints ?? Number(lineup.total_points || 0),
          current_budget: lineup.budget_after ?? lineup.budget_before ?? 0,
          rounds_played: 1,
          is_live: live!.isLive,
        });
      }
      for (const projection of live!.byUserId.values()) {
        if (!byUserId.has(projection.userId)) {
          byUserId.set(projection.userId, {
            id: projection.lineupId,
            user_id: projection.userId,
            round_id: live!.roundId,
            total_points: projection.totalPoints,
            current_budget: 0,
            rounds_played: 1,
            is_live: live!.isLive,
          });
        }
      }
      entries = [...byUserId.values()];
    } else {
      entries = persistedLineups.map((item: any) => ({
        ...item,
        round_id: resolvedRoundId,
        current_budget: item.budget_after ?? item.budget_before,
        rounds_played: 1,
      }));
    }
  } else {
    const [{ data: accounts }, { data: seasonRounds }] = await Promise.all([
      rankingReadClient
        .from("fantasy_accounts")
        .select("*")
        .eq("fantasy_season_id", fs.id),
      rankingReadClient
        .from("fantasy_rounds")
        .select("id")
        .eq("fantasy_season_id", fs.id),
    ]);
    const fantasyRoundIds = (seasonRounds || []).map((item: any) => item.id);
    const { data: scoredLineups } = fantasyRoundIds.length
      ? await rankingReadClient
          .from("fantasy_lineups")
          .select("user_id, total_points")
          .in("fantasy_round_id", fantasyRoundIds)
          .eq("status", "scored")
      : { data: [] as any[] };
    const historicalByUser = new Map<string, { totalPoints: number; roundsPlayed: number; bestRound: number }>();
    for (const lineup of scoredLineups || []) {
      const current = historicalByUser.get(lineup.user_id) || { totalPoints: 0, roundsPlayed: 0, bestRound: 0 };
      const roundPoints = Number(lineup.total_points || 0);
      current.totalPoints += roundPoints;
      current.roundsPlayed += 1;
      current.bestRound = Math.max(current.bestRound, roundPoints);
      historicalByUser.set(lineup.user_id, current);
    }
    const byUserId = new Map<string, any>();
    for (const item of accounts || []) {
      const historical = historicalByUser.get(item.user_id) || { totalPoints: 0, roundsPlayed: 0, bestRound: 0 };
      byUserId.set(item.user_id, {
        ...item,
        total_points: historical.totalPoints + (live?.byUserId.get(item.user_id)?.totalPoints || 0),
        rounds_played: historical.roundsPlayed,
        best_round_points: historical.bestRound,
        is_live: Boolean(live?.byUserId.has(item.user_id)),
      });
    }
    for (const [userId, historical] of historicalByUser) {
      if (!byUserId.has(userId)) {
        byUserId.set(userId, {
          user_id: userId,
          total_points: historical.totalPoints + (live?.byUserId.get(userId)?.totalPoints || 0),
          rounds_played: historical.roundsPlayed,
          best_round_points: historical.bestRound,
          current_budget: 0,
          is_live: Boolean(live?.byUserId.has(userId)),
        });
      }
    }
    // Uma conta pode ter sido criada a partir da escalação e ainda não ter o
    // agregado histórico preenchido. A prévia ao vivo continua sendo válida e
    // deve colocá-la no ranking geral imediatamente.
    for (const projection of live?.byUserId.values() || []) {
      if (!byUserId.has(projection.userId)) {
        byUserId.set(projection.userId, {
          id: projection.lineupId,
          user_id: projection.userId,
          total_points: projection.totalPoints,
          current_budget: 0,
          rounds_played: 0,
          is_live: true,
        });
      }
    }
    entries = [...byUserId.values()];
  }

  entries.sort((a: any, b: any) => Number(b.total_points) - Number(a.total_points));
  const userIds = entries.map((item: any) => item.user_id);
  const [{ data: profiles }, { data: cosmeticLoadouts }] = userIds.length
    ? await Promise.all([
        rankingReadClient
          .from("account_profiles")
          .select("user_id, players(name, avatar_url)")
          .in("user_id", userIds),
        rankingReadClient
          .from("fantasy_user_cosmetic_loadouts")
          .select("user_id, frame:frame_cosmetic_id(asset_key), aura:aura_cosmetic_id(asset_key)")
          .eq("fantasy_season_id", fs.id)
          .in("user_id", userIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  const profileByUser = new Map(
    (profiles || []).map((item: any) => [item.user_id, item.players])
  );
  const cosmeticsByUser = new Map(
    (cosmeticLoadouts || []).map((item: any) => [item.user_id, {
      frameKey: item.frame?.asset_key || null,
      auraKey: item.aura?.asset_key || null,
    }]),
  );
  let previousPoints: number | null = null;
  let previousPosition = 0;
  return entries.map((item: any, index: number) => {
    const points = Number(item.total_points || 0);
    const position = previousPoints === points ? previousPosition : index + 1;
    previousPoints = points;
    previousPosition = position;
    return {
      ...item,
      position,
      player: profileByUser.get(item.user_id) || null,
      cosmetics: cosmeticsByUser.get(item.user_id) || null,
    };
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
  cosmetics?: {
    frameKey: string | null;
    auraKey: string | null;
    backgroundAssetKey: string | null;
  } | null;
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

  // Antes do fechamento só expomos nome e estado salvo/pendente, nunca os
  // atletas escolhidos. A leitura de serviço evita que a RLS transforme a
  // lista coletiva em "somente eu".
  const overviewReadClient = createServiceClient() || account.client;

  const { data: fantasyRounds } = await overviewReadClient
    .from("fantasy_rounds")
    .select("id, market_status, round_id, round:round_id(id, number, date, status, round_type, matches(id, status, started_at))")
    .eq("fantasy_season_id", fs.id);

  const officialFantasyRounds = (fantasyRounds || []).filter(
    (fr: any) => fr.round?.round_type === "official"
  );

  const sortedRounds = [...officialFantasyRounds].sort((a: any, b: any) => {
    // Uma rodada que já começou sempre é o alvo padrão, mesmo que já exista
    // outra rodada futura aberta no calendário.
    if (a.market_status !== b.market_status) {
      return a.market_status === "in_progress" ? -1 : b.market_status === "in_progress" ? 1 : 0;
    }
    return `${b.round?.date || ""}-${String(b.round?.number || 0).padStart(4, "0")}`.localeCompare(
      `${a.round?.date || ""}-${String(a.round?.number || 0).padStart(4, "0")}`
    );
  });

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

  const hasStartedMatch = (targetFantasyRound.round?.matches || []).some((match: any) =>
    match.started_at || match.status === "live" || match.status === "finished"
  );
  const isRoundOpen =
    targetFantasyRound.market_status === "open" &&
    !hasStartedMatch &&
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

  const [{ data: fantasyAccounts }, { data: allProfiles }, { data: lineups }, { data: openRoundLoadouts }] =
    await Promise.all([
      overviewReadClient.from("fantasy_accounts").select("user_id").eq("fantasy_season_id", fs.id),
      overviewReadClient
        .from("account_profiles")
        .select("user_id, players(name, avatar_url)")
        .not("player_id", "is", null),
      overviewReadClient
        .from("fantasy_lineups")
        .select("id, user_id, status, updated_at, created_at")
        .eq("fantasy_round_id", targetFantasyRound.id),
      overviewReadClient
        .from("fantasy_user_cosmetic_loadouts")
        .select("user_id, frame:frame_cosmetic_id(asset_key), aura:aura_cosmetic_id(asset_key), background:background_cosmetic_id(asset_key)")
        .eq("fantasy_season_id", fs.id),
    ]);

  const lineupByUser = new Map((lineups || []).map((l: any) => [l.user_id, l]));
  const profileByUser = new Map(
    (allProfiles || []).map((p: any) => [p.user_id, p.players])
  );
  const cosmeticsByUser = new Map(
    (openRoundLoadouts || []).map((item: any) => [item.user_id, {
      frameKey: item.frame?.asset_key || null,
      auraKey: item.aura?.asset_key || null,
      backgroundAssetKey: item.background?.asset_key || null,
    }]),
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
        cosmetics: cosmeticsByUser.get(userId) || null,
      });
    } else {
      pending.push({
        userId,
        playerName,
        avatarUrl,
        hasSaved: false,
        savedAt: null,
        isCurrentUser,
        cosmetics: cosmeticsByUser.get(userId) || null,
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

export async function repairLegacySavedFantasyLineups() {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Sem permissão." };
  const { data, error } = await account.client.rpc("repair_legacy_saved_fantasy_lineups");
  if (error) return { success: false, error: error.message };
  revalidatePath("/cartola/ranking");
  revalidatePath("/admin/cartola");
  return {
    success: true,
    repaired: Number(data?.repaired || 0),
    lineups: Array.isArray(data?.lineups) ? data.lineups : [],
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
  playerStats: FantasyLivePlayerStats[];
  currentUser: FantasyLiveLineupProjection | null;
};

export type SeasonPassEvent = {
  id: string;
  eventType: "valid_lineup";
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
  shopCycleRemainder: number;
  shopBonusPoints: number;
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
    mode: "athlete", participations: 0, activeWeeks: 0, validLineups: 0, shopCycleRemainder: 0, shopBonusPoints: 0,
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

  const [{ data: pass, error: passError }, { data: rows, error: eventsError }] = await Promise.all([
    account.client
      .from("fantasy_season_passes")
      .select("progress, progression_mode, participations, active_weeks, valid_lineups, goals_assists_remainder, shop_bonus_points")
      .eq("fantasy_season_id", fantasySeason.id)
      .eq("user_id", account.user.id)
      .maybeSingle(),
    account.client
      .from("fantasy_season_pass_events")
      .select("id, event_type, houses, source_round_id, created_at, rounds:source_round_id(number, date)")
      .eq("fantasy_season_id", fantasySeason.id)
      .eq("user_id", account.user.id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  // Enquanto a migration 060 nao estiver aplicada, o restante do app segue utilizavel.
  if (passError) return empty;
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
    shopCycleRemainder: Number(pass?.goals_assists_remainder || 0),
    shopBonusPoints: Number(pass?.shop_bonus_points || 0),
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
  const account = await getCurrentAccount();
  if (!account.user) return null;
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  if (!season) return null;
  const [{ data: fantasySeason }, { data: profile }, history] = await Promise.all([
    account.client.from("fantasy_seasons").select("id").eq("season_id", season.id).maybeSingle(),
    account.client.from("account_profiles").select("user_id, players(name, avatar_url)").eq("user_id", userId).maybeSingle(),
    getFantasyUserHistory(userId),
  ]);
  if (!fantasySeason) return null;

  const { data: fantasyRound } = await account.client
    .from("fantasy_rounds")
    .select("id, round_id, market_status, settings_snapshot, rounds(number, date, status, matches(id, status, started_at))")
    .eq("fantasy_season_id", fantasySeason.id)
    .eq("round_id", roundId)
    .maybeSingle();
  if (!fantasyRound) return null;

  const roundInfo = Array.isArray(fantasyRound.rounds) ? fantasyRound.rounds[0] || null : fantasyRound.rounds;
  const hasStartedMatch = (roundInfo?.matches || []).some((match: any) =>
    match.started_at || match.status === "live" || match.status === "finished"
  );
  const lineupReadClient = hasStartedMatch ? (createServiceClient() || account.client) : account.client;

  const { data: storedLineup } = await lineupReadClient
    .from("fantasy_lineups")
    .select("*, fantasy_lineup_players(*, players(name, avatar_url))")
    .eq("fantasy_round_id", fantasyRound.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!storedLineup) return null;

  // Rodada finalizada deve mostrar o resultado oficial persistido. Recalcular
  // um histórico como projeção ao vivo pode usar scouts corrigidos depois do
  // fechamento e fazer o detalhe divergir do ranking geral.
  const live = fantasyRound.market_status === "in_progress"
    ? await getLiveRoundProjections(account.client, fantasySeason.id, league.id, roundId)
    : null;
  const projection = live?.roundId === roundId ? live.byUserId.get(userId) || null : null;
  const livePointsByPlayer = new Map(
    (projection?.players || []).map((item) => [item.playerId, item]),
  );
  const lineup = projection
    ? {
        ...storedLineup,
        player_points: projection.playerPoints,
        prediction_points: projection.predictionPoints,
        total_points: projection.totalPoints,
        score_breakdown: {
          ...(storedLineup.score_breakdown || {}),
          captainBonus: projection.captainBonus,
          positionBonus: projection.positionBonus,
          cardBonus: projection.cardPoints,
          live: true,
        },
        fantasy_lineup_players: (storedLineup.fantasy_lineup_players || []).map((item: any) => ({
          ...item,
          base_points: livePointsByPlayer.get(item.player_id)?.basePoints || 0,
          position_bonus: livePointsByPlayer.get(item.player_id)?.positionBonus || 0,
          captain_bonus: livePointsByPlayer.get(item.player_id)?.captainBonus || 0,
          total_points: livePointsByPlayer.get(item.player_id)?.totalPoints || 0,
        })),
      }
    : storedLineup;
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
    history: history || { player: profile?.players || null },
    lineup,
    round: roundInfo,
    isLive: Boolean(projection && live?.isLive),
    settingsSnapshot: fantasyRound.settings_snapshot || {},
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
