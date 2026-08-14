"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccount } from "@/lib/auth";
import { getActiveLeague } from "./rounds";
import { getActiveSeason } from "./seasons";
import { DEFAULT_FANTASY_SETTINGS, type FantasySettings } from "@/lib/fantasy/config";

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
  roundPoints: number;
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

  if (!fantasySeason) {
    return { authenticated: true as const, available: false as const, settings, migrationRequired: true as const };
  }

  const { data: fantasyRoundRows } = await account.client
    .from("fantasy_rounds")
    .select("*, round:round_id(id, number, date, start_time, status, round_type, teams(id, name, color), matches(id, status))")
    .eq("fantasy_season_id", fantasySeason.id);
  const officialFantasyRounds = (fantasyRoundRows || []).filter((item: any) => item.round?.round_type === "official");
  const byRoundDateDesc = (a: any, b: any) =>
    `${b.round?.date || ""}-${String(b.round?.number || 0).padStart(4, "0")}`.localeCompare(`${a.round?.date || ""}-${String(a.round?.number || 0).padStart(4, "0")}`);
  const activeOfficialRound = officialFantasyRounds
    .filter((item: any) => item.market_status === "in_progress" || item.market_status === "open")
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
  const latestLineupRequest = latestFinishedRound
    ? account.client.from("fantasy_lineups").select("*, fantasy_lineup_players(*)").eq("fantasy_round_id", latestFinishedRound.id).eq("user_id", account.user.id).maybeSingle()
    : Promise.resolve({ data: null as any });
  const [{ data: priceRows }, { data: statRows }, { data: roundParticipants }, { data: rawLineup }, { data: latestLineup }, { data: fantasyAccount }, { data: liveEvents }, { data: selectablePlayers }, { data: portfolio }, { data: priceHistory }] = await Promise.all([
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
    account.client.from("fantasy_portfolios").select("*, fantasy_portfolio_players(*)").eq("fantasy_season_id", fantasySeason.id).eq("user_id", account.user.id).maybeSingle(),
    account.client.from("fantasy_player_price_history").select("player_id, fantasy_round_id, variation_rate, round_points, goals, assists, wins, games, created_at").eq("fantasy_season_id", fantasySeason.id).order("created_at", { ascending: false }),
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
  const latestRoundPerformance = new Map<string, number>();
  for (const row of priceHistory || []) {
    if (!lastVariation.has(row.player_id)) lastVariation.set(row.player_id, Number(row.variation_rate || 0));
    if (latestFinishedRound && row.fantasy_round_id === latestFinishedRound.id) {
      latestRoundPerformance.set(row.player_id, Number(row.round_points || 0));
    }
  }

  const market: FantasyMarketPlayer[] = (players || [])
    .filter((player: any) => isTest || player.is_selectable || (player.member_category === "guest" && participantIds.includes(player.id)))
    .map((player: any) => {
      const price = priceByPlayer.get(player.id) as any;
      const stats = statsByPlayer.get(player.id) || { goals: 0, assists: 0, wins: 0, games: 0 };
      return { id: player.id, name: player.name, avatarUrl: player.avatar_url, profile: player.player_profile,
        price: isTest ? settings.initialPlayerPrice : Number(price?.current_price ?? settings.initialPlayerPrice),
        totalPoints: isTest ? 0 : Number(price?.total_points || 0),
        roundsPlayed: isTest ? 0 : Number(price?.rounds_played || 0), ...stats,
        variation: isTest ? 0 : lastVariation.get(player.id) || 0,
        roundPoints: betweenRounds
          ? latestRoundPerformance.get(player.id) || 0
          : (currentStats.get(player.id)?.goals || 0) * settings.goalPoints + (currentStats.get(player.id)?.assists || 0) * settings.assistPoints + (currentStats.get(player.id)?.wins || 0) * settings.winPoints };
    }).sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name, "pt-BR"));

  let effectiveLineup: any = lineup || null;
  if (!effectiveLineup && !isTest) {
    const savedSelection = portfolio
      ? {
          captain_player_id: portfolio.captain_player_id,
          fantasy_lineup_players: portfolio.fantasy_portfolio_players || [],
        }
      : latestLineup;
    if (savedSelection) {
      const eligible = (savedSelection.fantasy_lineup_players || []).map((item: any) => item.player_id).filter((id: string) => market.some((player) => player.id === id));
      const suggestedCost = eligible.reduce((sum: number, id: string) => sum + (market.find((player) => player.id === id)?.price || 0), 0);
      if (suggestedCost <= Number(fantasyAccount?.current_budget ?? settings.initialBudget)) {
        effectiveLineup = { ...savedSelection, status: betweenRounds ? "portfolio" : "suggested", fantasy_lineup_players: eligible.map((player_id: string) => ({ player_id })) };
      }
    }
  }
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
    },
    market, lineup: effectiveLineup,
    budget: isTest ? settings.initialBudget : Number(fantasyAccount?.current_budget ?? settings.initialBudget),
    lastRound: latestFinishedRound ? {
      number: latestFinishedRound.round?.number,
      date: latestFinishedRound.round?.date,
      playerPoints: Number(latestLineup?.player_points || 0),
      predictionPoints: Number(latestLineup?.prediction_points || 0),
      totalPoints: Number(latestLineup?.total_points || 0),
    } : null,
  };
}

export async function saveFantasyLineup(input: { fantasySeasonId: string; roundId: string | null; playerIds: string[]; captainId: string | null; scorerId: string | null; assistId: string | null; teamId: string | null }) {
  try {
    const account = await getCurrentAccount();
    if (!account.user) return { success: false, error: "Entre na sua conta para escalar." };
    if (!input.fantasySeasonId || input.playerIds.length > 5 || new Set(input.playerIds).size !== input.playerIds.length) {
      return { success: false, error: "A escalação enviada é inválida. Atualize a página e tente novamente." };
    }
    const { data: testSession } = input.roundId
      ? await account.client.from("fantasy_test_sessions").select("id").eq("round_id", input.roundId).maybeSingle()
      : { data: null };
    if (testSession && input.roundId) {
      const { error } = await account.client.rpc("save_fantasy_test_lineup", {
        p_round_id: input.roundId, p_player_ids: input.playerIds, p_captain_player_id: input.captainId,
        p_top_scorer_player_id: input.scorerId, p_top_assist_player_id: input.assistId, p_top_team_id: input.teamId,
      });
      if (error) return { success: false, error: error.message };
    } else {
      const { error: portfolioError } = await account.client.rpc("save_fantasy_portfolio", {
        p_fantasy_season_id: input.fantasySeasonId,
        p_player_ids: input.playerIds,
        p_captain_player_id: input.captainId,
      });
      if (portfolioError) return { success: false, error: portfolioError.message };
      if (input.roundId) {
        const { error: lineupError } = await account.client.rpc("save_fantasy_lineup", {
          p_round_id: input.roundId, p_player_ids: input.playerIds, p_captain_player_id: input.captainId,
          p_top_scorer_player_id: input.scorerId, p_top_assist_player_id: input.assistId, p_top_team_id: input.teamId,
        });
        if (lineupError) return { success: false, error: lineupError.message };
      }
    }
    revalidatePath("/cartola");
    return { success: true };
  } catch (error) {
    console.error("Erro inesperado ao salvar escalação do Cartola:", error);
    return { success: false, error: "Não foi possível salvar agora. Atualize a página e tente novamente." };
  }
}

export async function getFantasyRanking() {
  const account = await getCurrentAccount();
  if (!account.user) return [];
  const league = await getActiveLeague(); const season = await getActiveSeason(league.id); if (!season) return [];
  const { data: fs } = await account.client.from("fantasy_seasons").select("id").eq("season_id", season.id).maybeSingle(); if (!fs) return [];
  const { data: accounts } = await account.client.from("fantasy_accounts").select("*").eq("fantasy_season_id", fs.id).order("total_points", { ascending: false });
  const userIds = (accounts || []).map((item: any) => item.user_id);
  const { data: profiles } = userIds.length ? await account.client.from("account_profiles").select("user_id, players(name, avatar_url)").in("user_id", userIds) : { data: [] as any[] };
  const profileByUser = new Map((profiles || []).map((item: any) => [item.user_id, item.players]));
  return (accounts || []).map((item: any, index: number) => ({ ...item, position: index + 1, player: profileByUser.get(item.user_id) || null }));
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
