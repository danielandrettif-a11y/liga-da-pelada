"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "@/lib/auth";
import { getActiveLeague } from "./rounds";
import { getActiveSeason } from "./seasons";
import { DEFAULT_FANTASY_SETTINGS, type FantasySettings } from "@/lib/fantasy/config";
import type { FantasyChallengeType } from "@/lib/fantasy/challenges";

export type FantasyMarketPlayer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  profile: string | null;
  price: number;
  totalPoints: number;
  roundsPlayed: number;
  goals: number;
  assists: number;
  wins: number;
  games: number;
  variation: number;
  priceChange: number;
  roundPoints: number;
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
  const settings: FantasySettings = settingsRow ? {
    currencyName: settingsRow.currency_name, initialBudget: Number(settingsRow.initial_budget), initialPlayerPrice: Number(settingsRow.initial_player_price),
    minPlayerPrice: Number(settingsRow.min_player_price), maxPlayerPrice: Number(settingsRow.max_player_price), goalPoints: Number(settingsRow.goal_points),
    assistPoints: Number(settingsRow.assist_points), winPoints: Number(settingsRow.win_points), captainMultiplier: Number(settingsRow.captain_multiplier),
    topScorerPredictionPoints: Number(settingsRow.top_scorer_prediction_points), topAssistPredictionPoints: Number(settingsRow.top_assist_prediction_points),
    topTeamPredictionPoints: Number(settingsRow.top_team_prediction_points), recentWeight: Number(settingsRow.recent_weight),
    kingOfWinsPoints: Number(settingsRow.king_of_wins_points ?? 6), mvpPredictionPoints: Number(settingsRow.mvp_prediction_points ?? 8),
    betOfRoundPoints: Number(settingsRow.bet_of_round_points ?? 8),
    betRequiredRanks: [1, 2, 3, 4].map((band) => Number(settingsRow[`bet_rank_band_${band}`] ?? 6 - band)) as [number, number, number, number],
    scoreGoalRewards: [1, 2, 3, 4].map((band) => Number(settingsRow[`score_goal_reward_band_${band}`] ?? [7, 6, 4, 3][band - 1])) as [number, number, number, number],
    winRateWeight: Number(settingsRow.win_rate_weight), historicalWeight: Number(settingsRow.historical_weight), consistencyWeight: Number(settingsRow.consistency_weight),
    smoothingGames: Number(settingsRow.smoothing_games), maxPriceIncrease: Number(settingsRow.max_price_increase), maxPriceDecrease: Number(settingsRow.max_price_decrease),
  } : DEFAULT_FANTASY_SETTINGS;

  const [{ data: testSession }, { data: fantasySeason }] = await Promise.all([
    account.client.from("fantasy_test_sessions")
      .select("*, round:round_id(id, number, date, start_time, status, round_type, teams(id, name, color), matches(id, status))")
      .eq("league_id", league.id)
      .eq("season_id", season.id)
      .in("status", ["open", "in_progress"])
      .maybeSingle(),
    account.client.from("fantasy_seasons").select("id, initial_budget, initial_player_price").eq("season_id", season.id).maybeSingle(),
  ]);

  if (!fantasySeason || !settingsRow || !("king_of_wins_points" in settingsRow)) {
    return { authenticated: true as const, available: false as const, settings, migrationRequired: true as const };
  }

  const { data: fantasyRoundRows } = await account.client
    .from("fantasy_rounds")
    .select("*, round:round_id(id, number, date, start_time, status, round_type, preparation_stage, teams(id, name, color), matches(id, status))")
    .eq("fantasy_season_id", fantasySeason.id);
  const officialFantasyRounds = (fantasyRoundRows || []).filter((item: any) => item.round?.round_type === "official");
  const byRoundDateDesc = (a: any, b: any) =>
    `${b.round?.date || ""}-${String(b.round?.number || 0).padStart(4, "0")}`.localeCompare(`${a.round?.date || ""}-${String(a.round?.number || 0).padStart(4, "0")}`);
  const activeOfficialRound = officialFantasyRounds
    .filter((item: any) => item.round?.status !== "finished" && (item.market_status === "in_progress" || item.market_status === "open"))
    .sort((a: any, b: any) => {
      if (a.market_status !== b.market_status) return a.market_status === "in_progress" ? -1 : 1;
      return byRoundDateDesc(a, b);
    })[0] || null;
  const latestFinishedRound = officialFantasyRounds
    .filter((item: any) => item.market_status === "finished")
    .sort(byRoundDateDesc)[0] || null;

  const isTest = Boolean(testSession);
  const fantasyRound: any = testSession
    ? { ...testSession, market_status: testSession.status }
    : activeOfficialRound;
  const betweenRounds = !isTest && !activeOfficialRound;
  const displayRound = fantasyRound?.round || latestFinishedRound?.round || null;
  const displayRoundId = displayRound?.id || null;
  const officialRoundIds = officialFantasyRounds.map((item: any) => item.round?.id).filter(Boolean);
  const matchIds = (displayRound?.matches || []).map((match: any) => match.id);
  const lineupRequest = isTest
    ? account.client.from("fantasy_test_lineups").select("*, fantasy_test_lineup_players(*)").eq("test_session_id", fantasyRound.id).eq("user_id", account.user.id).maybeSingle()
    : activeOfficialRound
      ? account.client.from("fantasy_lineups").select("*, fantasy_lineup_players(*)").eq("fantasy_round_id", activeOfficialRound.id).eq("user_id", account.user.id).maybeSingle()
      : Promise.resolve({ data: null as any });
  const portfolioRequest = !isTest
    ? account.client.from("fantasy_portfolios").select("*, fantasy_portfolio_players(*)").eq("fantasy_season_id", fantasySeason.id).eq("user_id", account.user.id).maybeSingle()
    : Promise.resolve({ data: null as any });
  const latestLineupRequest = latestFinishedRound
    ? account.client.from("fantasy_lineups").select("*, fantasy_lineup_players(*)").eq("fantasy_round_id", latestFinishedRound.id).eq("user_id", account.user.id).maybeSingle()
    : Promise.resolve({ data: null as any });
  const [{ data: priceRows }, { data: statRows }, { data: roundParticipants }, { data: rawLineup }, { data: latestLineup }, { data: fantasyAccount }, { data: liveEvents }, { data: selectablePlayers }, { data: priceHistory }, { data: latestRoundLineups }, { data: rawPortfolio }] = await Promise.all([
    account.client.from("fantasy_player_prices").select("*").eq("fantasy_season_id", fantasySeason.id),
    officialRoundIds.length
      ? account.client.from("player_round_stats").select("round_id, player_id, goals, assists, wins, games").in("round_id", officialRoundIds)
      : Promise.resolve({ data: [] as any[] }),
    displayRoundId
      ? account.client.from("round_players").select("player_id").eq("round_id", displayRoundId)
      : Promise.resolve({ data: [] as any[] }),
    lineupRequest,
    latestLineupRequest,
    account.client.from("fantasy_accounts").select("*").eq("fantasy_season_id", fantasySeason.id).eq("user_id", account.user.id).maybeSingle(),
    matchIds.length ? account.client.from("match_events").select("player_id, assist_player_id").in("match_id", matchIds) : Promise.resolve({ data: [] as any[] }),
    account.client.from("players").select("id, name, avatar_url, player_profile, member_category, is_selectable").eq("is_selectable", true).in("member_category", ["player", "guest"]),
    account.client.from("fantasy_player_price_history").select("player_id, fantasy_round_id, price_before, price_after, variation_rate, round_points, goals, assists, wins, games, created_at").eq("fantasy_season_id", fantasySeason.id).order("created_at", { ascending: false }),
    latestFinishedRound
      ? account.client.from("fantasy_lineups").select("status, fantasy_lineup_players(player_id)").eq("fantasy_round_id", latestFinishedRound.id).eq("status", "scored")
      : Promise.resolve({ data: [] as any[] }),
    portfolioRequest,
  ]);
  const lineup = isTest && rawLineup
    ? { ...rawLineup, fantasy_lineup_players: rawLineup.fantasy_test_lineup_players || [] }
    : rawLineup;
  const pricePlayerIds = (priceRows || []).map((row: any) => row.player_id);
  const participantIds = (roundParticipants || []).map((row: any) => row.player_id);
  const selectablePlayerIds = (selectablePlayers || []).map((row: any) => row.id);
  const eligibleIds = isTest ? participantIds : [...new Set([...pricePlayerIds, ...participantIds, ...selectablePlayerIds])];
  const { data: players } = eligibleIds.length
    ? await account.client.from("players").select("id, name, avatar_url, player_profile, member_category, is_selectable").in("id", eligibleIds)
    : { data: [] as any[] };
  const priceByPlayer = new Map((priceRows || []).map((row: any) => [row.player_id, row]));
  const statsByPlayer = new Map<string, { goals: number; assists: number; wins: number; games: number }>();
  const currentStats = new Map<string, { goals: number; assists: number; wins: number }>();
  for (const row of statRows || []) {
    const current = statsByPlayer.get(row.player_id) || { goals: 0, assists: 0, wins: 0, games: 0 };
    current.goals += Number(row.goals || 0); current.assists += Number(row.assists || 0);
    current.wins += Number(row.wins || 0); current.games += Number(row.games || 0);
    statsByPlayer.set(row.player_id, current);
    if (row.round_id === displayRoundId) currentStats.set(row.player_id, { goals: Number(row.goals || 0), assists: Number(row.assists || 0), wins: Number(row.wins || 0) });
  }
  if (liveEvents?.length) {
    for (const current of currentStats.values()) { current.goals = 0; current.assists = 0; }
    for (const event of liveEvents) {
      const scorer = currentStats.get(event.player_id) || { goals: 0, assists: 0, wins: 0 };
      scorer.goals += 1; currentStats.set(event.player_id, scorer);
      if (event.assist_player_id) { const assister = currentStats.get(event.assist_player_id) || { goals: 0, assists: 0, wins: 0 }; assister.assists += 1; currentStats.set(event.assist_player_id, assister); }
    }
    // Gols e assistências vêm da timeline ao vivo; as vitórias seguem o consolidado.
    for (const [playerId, current] of currentStats) {
      const official = (statRows || []).find((row: any) => row.round_id === displayRoundId && row.player_id === playerId);
      current.wins = Number(official?.wins || 0);
    }
  }
  const lastVariation = new Map<string, number>();
  const lastPriceChange = new Map<string, number>();
  const latestRoundPerformance = new Map<string, number>();
  for (const row of priceHistory || []) {
    if (!lastVariation.has(row.player_id)) {
      lastVariation.set(row.player_id, Number(row.variation_rate || 0));
      lastPriceChange.set(row.player_id, Number(row.price_after || 0) - Number(row.price_before || 0));
    }
    if (latestFinishedRound && row.fantasy_round_id === latestFinishedRound.id) {
      latestRoundPerformance.set(row.player_id, Number(row.round_points || 0));
    }
  }

  const market: FantasyMarketPlayer[] = (players || [])
    .filter((player: any) => isTest
      ? participantIds.includes(player.id)
      : player.member_category === "guest"
        ? Boolean(!betweenRounds && displayRoundId && participantIds.includes(player.id))
        : player.member_category === "player" && player.is_selectable)
    .map((player: any) => {
      const price = priceByPlayer.get(player.id) as any;
      const stats = statsByPlayer.get(player.id) || { goals: 0, assists: 0, wins: 0, games: 0 };
      return { id: player.id, name: player.name, avatarUrl: player.avatar_url, profile: player.player_profile,
        price: isTest ? settings.initialPlayerPrice : Number(price?.current_price ?? settings.initialPlayerPrice),
        totalPoints: isTest ? 0 : Number(price?.total_points || 0),
        roundsPlayed: isTest ? 0 : Number(price?.rounds_played || 0), ...stats,
        variation: isTest ? 0 : lastVariation.get(player.id) || 0,
        priceChange: isTest ? 0 : lastPriceChange.get(player.id) || 0,
        roundPoints: betweenRounds
          ? latestRoundPerformance.get(player.id) || 0
          : (currentStats.get(player.id)?.goals || 0) * settings.goalPoints + (currentStats.get(player.id)?.assists || 0) * settings.assistPoints + (currentStats.get(player.id)?.wins || 0) * settings.winPoints };
    }).sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name, "pt-BR"));

  let effectiveLineup: any = lineup || (rawPortfolio ? {
    ...rawPortfolio,
    captain_player_id: rawPortfolio.captain_player_id,
    fantasy_lineup_players: (rawPortfolio.fantasy_portfolio_players || []).filter((item: any) => market.some((player) => player.id === item.player_id)),
    status: betweenRounds ? "portfolio" : "suggested",
  } : null);
  if (effectiveLineup && !effectiveLineup.fantasy_lineup_players?.some((item: any) => item.player_id === effectiveLineup.captain_player_id)) {
    effectiveLineup.captain_player_id = null;
  }
  if (!effectiveLineup && !isTest) {
    const savedSelection = latestLineup;
    if (savedSelection) {
      const eligible = (savedSelection.fantasy_lineup_players || []).map((item: any) => item.player_id).filter((id: string) => market.some((player) => player.id === id));
      const suggestedCost = eligible.reduce((sum: number, id: string) => sum + (market.find((player) => player.id === id)?.price || 0), 0);
      if (suggestedCost <= Number(fantasyAccount?.current_budget ?? settings.initialBudget)) {
        effectiveLineup = { ...savedSelection, status: betweenRounds ? "previous" : "suggested", fantasy_lineup_players: eligible.map((player_id: string) => ({ player_id })) };
      }
    }
  }

  const selectionCounts = new Map<string, number>();
  for (const savedLineup of latestRoundLineups || []) {
    for (const item of savedLineup.fantasy_lineup_players || []) {
      selectionCounts.set(item.player_id, (selectionCounts.get(item.player_id) || 0) + 1);
    }
  }
  const topRoundPlayer = [...market].sort((a, b) => b.roundPoints - a.roundPoints || a.name.localeCompare(b.name, "pt-BR"))[0] || null;
  const mostSelectedBase = [...market].sort((a, b) => (selectionCounts.get(b.id) || 0) - (selectionCounts.get(a.id) || 0) || b.roundPoints - a.roundPoints)[0] || null;
  const topValuationPlayer = [...market].filter((player) => player.priceChange > 0).sort((a, b) => b.priceChange - a.priceChange)[0] || null;
  const topDepreciationPlayer = [...market].filter((player) => player.priceChange < 0).sort((a, b) => a.priceChange - b.priceChange)[0] || null;
  const insights: FantasyDashboardInsights = {
    topRoundPlayer: topRoundPlayer && topRoundPlayer.roundPoints > 0 ? { ...topRoundPlayer, selectionCount: selectionCounts.get(topRoundPlayer.id) || 0 } : null,
    mostSelectedPlayer: mostSelectedBase && (selectionCounts.get(mostSelectedBase.id) || 0) > 0
      ? { ...mostSelectedBase, selectionCount: selectionCounts.get(mostSelectedBase.id) || 0 }
      : null,
    topValuationPlayer,
    topDepreciationPlayer,
  };

  return {
    authenticated: true as const, available: true as const, isAdmin: account.isAdmin, settings,
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
    market, lineup: effectiveLineup, insights,
    budget: isTest ? settings.initialBudget : Number(fantasyAccount?.current_budget ?? settings.initialBudget),
    account: {
      totalPoints: Number(fantasyAccount?.total_points || 0),
      roundsPlayed: Number(fantasyAccount?.rounds_played || 0),
      bestRoundPoints: Number(fantasyAccount?.best_round_points || 0),
    },
    lastRound: latestFinishedRound ? {
      number: latestFinishedRound.round?.number,
      date: latestFinishedRound.round?.date,
      playerPoints: Number(latestLineup?.player_points || 0),
      predictionPoints: Number(latestLineup?.prediction_points || 0),
      totalPoints: Number(latestLineup?.total_points || 0),
    } : null,
  };
}

export async function saveFantasyLineup(input: { fantasySeasonId: string; roundId: string | null; playerIds: string[]; captainId: string | null; scorerId: string | null; assistId: string | null; challengeId: string | null }) {
  try {
    const account = await getCurrentAccount();
    if (!account.user) return { success: false, error: "Entre na sua conta para escalar." };
    if (input.playerIds.length > 5 || new Set(input.playerIds).size !== input.playerIds.length) {
      return { success: false, error: "A escalação enviada é inválida. Atualize a página e tente novamente." };
    }
    if (!input.roundId) {
      const { error } = await account.client.rpc("save_fantasy_portfolio", {
        p_fantasy_season_id: input.fantasySeasonId,
        p_player_ids: input.playerIds,
        p_captain_player_id: input.captainId,
      });
      if (error) return { success: false, error: error.message };
      revalidatePath("/cartola");
      return { success: true };
    }
    const { data: testSession } = input.roundId
      ? await account.client.from("fantasy_test_sessions").select("id").eq("round_id", input.roundId).maybeSingle()
      : { data: null };
    if (testSession && input.roundId) {
      const { error } = await account.client.rpc("save_fantasy_test_lineup", {
        p_round_id: input.roundId, p_player_ids: input.playerIds, p_captain_player_id: input.captainId,
        p_top_scorer_player_id: input.scorerId, p_top_assist_player_id: input.assistId, p_challenge_player_id: input.challengeId,
      });
      if (error) return { success: false, error: error.message };
    } else {
      const { error: lineupError } = await account.client.rpc("save_fantasy_lineup", {
        p_round_id: input.roundId, p_player_ids: input.playerIds, p_captain_player_id: input.captainId,
        p_top_scorer_player_id: input.scorerId, p_top_assist_player_id: input.assistId, p_challenge_player_id: input.challengeId,
      });
      if (lineupError) return { success: false, error: lineupError.message };
    }
    revalidatePath("/cartola");
    return { success: true };
  } catch (error) {
    console.error("Erro inesperado ao salvar escalação do Cartola:", error);
    return { success: false, error: "Não foi possível salvar agora. Atualize a página e tente novamente." };
  }
}

export async function getFantasyRanking(scope: "general" | "round" = "general", roundId?: string) {
  const account = await getCurrentAccount();
  if (!account.user) return [];
  const league = await getActiveLeague(); const season = await getActiveSeason(league.id); if (!season) return [];
  const { data: fs } = await account.client.from("fantasy_seasons").select("id").eq("season_id", season.id).maybeSingle(); if (!fs) return [];
  let entries: any[] = [];
  if (scope === "round") {
    let fantasyRoundId: string | null = null;
    if (roundId) {
      const { data } = await account.client.from("fantasy_rounds").select("id").eq("fantasy_season_id", fs.id).eq("round_id", roundId).maybeSingle();
      fantasyRoundId = data?.id || null;
    } else {
      const { data } = await account.client.from("fantasy_rounds").select("id, round:round_id(date, number)").eq("fantasy_season_id", fs.id);
      fantasyRoundId = (data || []).sort((a: any, b: any) => `${b.round?.date}-${b.round?.number}`.localeCompare(`${a.round?.date}-${a.round?.number}`))[0]?.id || null;
    }
    if (fantasyRoundId) {
      const { data } = await account.client.from("fantasy_lineups").select("id, user_id, total_points, budget_after, budget_before, status").eq("fantasy_round_id", fantasyRoundId).in("status", ["locked", "scored"]);
      entries = (data || []).map((item: any) => ({ ...item, current_budget: item.budget_after ?? item.budget_before, rounds_played: 1 }));
    }
  } else {
    const { data } = await account.client.from("fantasy_accounts").select("*").eq("fantasy_season_id", fs.id).order("total_points", { ascending: false });
    entries = data || [];
  }
  entries.sort((a: any, b: any) => Number(b.total_points) - Number(a.total_points));
  const userIds = entries.map((item: any) => item.user_id);
  const { data: profiles } = userIds.length ? await account.client.from("account_profiles").select("user_id, players(name, avatar_url)").in("user_id", userIds) : { data: [] as any[] };
  const profileByUser = new Map((profiles || []).map((item: any) => [item.user_id, item.players]));
  let previousPoints: number | null = null;
  let previousPosition = 0;
  return entries.map((item: any, index: number) => {
    const points = Number(item.total_points || 0);
    const position = previousPoints === points ? previousPosition : index + 1;
    previousPoints = points; previousPosition = position;
    return { ...item, position, player: profileByUser.get(item.user_id) || null };
  });
}

export async function updateFantasySettings(values: Partial<FantasySettings>) {
  const account = await getCurrentAccount(); if (!account.isAdmin) return { success: false, error: "Somente administradores." };
  const { error } = await account.client.rpc("update_fantasy_settings", { p_settings: values });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/cartola"); revalidatePath("/cartola"); return { success: true };
}

export async function reprocessFantasyRound(roundId: string) {
  const account = await getCurrentAccount(); if (!account.isAdmin) return { success: false, error: "Somente administradores." };
  const { error } = await account.client.rpc("reprocess_fantasy_from_round", { p_round_id: roundId });
  if (error) return { success: false, error: error.message };
  revalidatePath("/cartola", "layout"); return { success: true };
}

export async function getFantasyAdminData() {
  const account = await getCurrentAccount(); if (!account.isAdmin) return null;
  const league = await getActiveLeague();
  const season = await getActiveSeason(league.id);
  const { data: settings } = await account.client.from("fantasy_settings").select("*").eq("league_id", league.id).maybeSingle();
  const { data: rounds } = await account.client.from("fantasy_rounds").select("id, market_status, processed_at, round:round_id(id, number, date, status, round_type)").order("created_at", { ascending: false }).limit(20);
  const [{ data: testSession }, { data: friendlyRounds }] = await Promise.all([
    account.client.from("fantasy_test_sessions")
      .select("*, round:round_id(id, number, date, start_time, status, round_type, round_players(count), matches(id, status, started_at))")
      .eq("league_id", league.id).maybeSingle(),
    season
      ? account.client.from("rounds")
        .select("id, number, date, start_time, status, round_type, round_players(count), matches(id, status, started_at)")
        .eq("league_id", league.id).eq("season_id", season.id).eq("round_type", "friendly")
        .order("date", { ascending: false }).limit(12)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  return { settings: settings || {
    currency_name: DEFAULT_FANTASY_SETTINGS.currencyName,
    initial_budget: DEFAULT_FANTASY_SETTINGS.initialBudget,
    initial_player_price: DEFAULT_FANTASY_SETTINGS.initialPlayerPrice,
    min_player_price: DEFAULT_FANTASY_SETTINGS.minPlayerPrice,
    max_player_price: DEFAULT_FANTASY_SETTINGS.maxPlayerPrice,
    goal_points: DEFAULT_FANTASY_SETTINGS.goalPoints,
    assist_points: DEFAULT_FANTASY_SETTINGS.assistPoints,
    win_points: DEFAULT_FANTASY_SETTINGS.winPoints,
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
  }, rounds: rounds || [], testSession: testSession || null, friendlyRounds: friendlyRounds || [] };
}

export async function createFantasyTestSession(roundId: string) {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores." };
  const { error } = await account.client.rpc("create_fantasy_test_session", { p_round_id: roundId });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/cartola"); revalidatePath("/cartola", "layout");
  return { success: true };
}

export async function processFantasyTestSession(roundId: string) {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores." };
  const { error } = await account.client.rpc("process_fantasy_test_round", { p_round_id: roundId });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/cartola"); revalidatePath("/cartola", "layout");
  return { success: true };
}

export async function resetFantasyTestSession(roundId: string) {
  const account = await getCurrentAccount();
  if (!account.isAdmin) return { success: false, error: "Somente administradores." };
  const { error } = await account.client.rpc("reset_fantasy_test_session", { p_round_id: roundId });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/cartola"); revalidatePath("/cartola", "layout");
  return { success: true };
}

export async function getFantasyPlayerSummary(playerId: string) {
  const account = await getCurrentAccount(); if (!account.user) return null;
  const league = await getActiveLeague(); const season = await getActiveSeason(league.id); if (!season) return null;
  const { data: fs } = await account.client.from("fantasy_seasons").select("id").eq("season_id", season.id).maybeSingle(); if (!fs) return null;
  const [{ data: price }, { data: history }] = await Promise.all([
    account.client.from("fantasy_player_prices").select("*").eq("fantasy_season_id", fs.id).eq("player_id", playerId).maybeSingle(),
    account.client.from("fantasy_player_price_history").select("price_after, variation_rate, round_points, created_at").eq("fantasy_season_id", fs.id).eq("player_id", playerId).order("created_at", { ascending: true }),
  ]);
  if (!price) return null;
  return { price: Number(price.current_price), totalPoints: Number(price.total_points), roundsPlayed: Number(price.rounds_played), history: (history || []).map((item: any) => ({ ...item, price_after: Number(item.price_after), variation_rate: Number(item.variation_rate), round_points: Number(item.round_points) })) };
}

export async function getMyFantasySummary() {
  const account = await getCurrentAccount(); if (!account.user) return null;
  const ranking = await getFantasyRanking();
  return ranking.find((item: any) => item.user_id === account.user!.id) || null;
}

export async function getMyFantasyHistory() {
  const account = await getCurrentAccount(); if (!account.user) return [];
  const { data } = await account.client.from("fantasy_lineups").select("*, fantasy_rounds(round_id, market_status, rounds(number, date))")
    .eq("user_id", account.user.id).order("created_at", { ascending: false });
  return data || [];
}
