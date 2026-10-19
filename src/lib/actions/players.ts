"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { cache } from "react";
import { createClient as createServerClient } from "../supabase/server";
import { buildAwardSeasonsByPlayer } from "../awards";
import type { Player, CreatePlayerInput, MemberCategory, PlayerProfile, RoundType, SeasonStatus } from "../types";
import { getActiveSeason, getActiveSeasonRoundIds } from "./seasons";
import { getAdminClient, getCurrentAccount } from "../auth";
import { TEAM_PRESETS } from "../teamPresets";
import { getMatchElapsedSeconds } from "../utils";
import { parseMonthlyAwardWinners, parseMonthlyAwards, previousMonthStart } from "../monthly-awards";
import { getLatestPlayerCardOverallMap } from "./stats";
import { parseAchievementBelts, type PlayerAchievementBelt } from "../achievement-belts";
import { getSelectedLeague } from "../league-context";
import { buildRankedPointBreakdown } from "../ranked-scoring";
import { normalizeBQScoringSnapshot } from "../bq-scoring";
import { roundRankingPoints } from "../ranking";
import { logStatsQuery } from "../stats-query-diagnostics";
import {
  canonicalRoundPoints,
} from "@/modules/statistics/domain/player-statistics";
import { buildPlayerSeasonStatistics } from "@/modules/statistics/application/build-player-season-statistics";
import {
  readPlayerRoundHistoryRows,
  readSeasonPlayerTotals,
} from "@/modules/statistics/infrastructure/supabase-statistics-reader";

const AVATAR_BUCKET = "player-avatars";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const AVATAR_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const OVERALL_TRAITS = ["defensive", "offensive"] as const;

function normalizeLineProfile(value: PlayerProfile | null | undefined): "defensive" | "offensive" {
  return value === "defensive" ? "defensive" : "offensive";
}

function normalizeOverallTraits(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  const traits = [...new Set(values.flatMap((item) => {
    if (item === "midfield") return ["offensive" as const];
    return typeof item === "string" && OVERALL_TRAITS.includes(item as (typeof OVERALL_TRAITS)[number])
      ? [item as (typeof OVERALL_TRAITS)[number]]
      : [];
  }))];
  return traits.slice(0, 2);
}

function playerWithLeagueProfile(member: any): Player | null {
  const player = Array.isArray(member?.players) ? member.players[0] : member?.players;
  if (!player) return null;
  const playerProfile = member.player_profile ?? player.player_profile;
  const overallTraits = Array.isArray(member.overall_traits) ? member.overall_traits : player.overall_traits;
  return {
    ...player,
    player_profile: playerProfile,
    initial_player_profile: member.initial_player_profile ?? playerProfile ?? player.initial_player_profile ?? player.player_profile,
    overall_traits: overallTraits,
    overall_seed_mode: member.overall_seed_mode ?? player.overall_seed_mode,
    is_competitive_profile_complete: player.member_category === "player"
      && player.is_selectable === true
      && Boolean(String(player.name || "").trim())
      && Boolean(String(player.avatar_url || "").trim())
      && ["defensive", "offensive"].includes(playerProfile)
      && Array.isArray(overallTraits)
      && overallTraits.length >= 1
      && overallTraits.length <= 2,
  } as Player;
}

function revalidatePlayerPaths(id?: string) {
  // O avatar está presente no cabeçalho compartilhado. Invalidar o layout
  // garante que a foto nova apareça imediatamente em qualquer tela do app.
  revalidatePath("/", "layout");
  revalidatePath("/mais");
  revalidatePath("/meu-perfil");
  revalidatePath("/jogadores");
  revalidatePath("/ranking");
  revalidatePath("/admin/jogadores");
  revalidatePath("/admin/rodada");
  revalidatePath("/admin/prelistas");
  revalidatePath("/cartola", "layout");
  revalidateTag("ranking", "max");
  if (id) revalidatePath(`/jogadores/${id}`);
}

function avatarPathFromUrl(avatarUrl: string | null) {
  if (!avatarUrl) return null;

  try {
    const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
    const pathname = new URL(avatarUrl).pathname;
    const markerIndex = pathname.indexOf(marker);
    return markerIndex >= 0
      ? decodeURIComponent(pathname.slice(markerIndex + marker.length))
      : null;
  } catch {
    return null;
  }
}

async function playerBelongsToSelectedLeague(playerId: string, client: Awaited<ReturnType<typeof createServerClient>>) {
  const league = await getSelectedLeague();
  if (!league) return false;
  const { data } = await client.from("league_members").select("player_id")
    .eq("league_id", league.id).eq("player_id", playerId).eq("is_active", true).maybeSingle();
  return Boolean(data);
}

export async function getPlayers(selectableOnly = false) {
  const league = await getSelectedLeague();
  if (!league) return [];
  const client = await createServerClient();
  const { data, error } = await client
    .from("league_members")
    .select("player_profile, initial_player_profile, overall_traits, overall_seed_mode, players(*)")
    .eq("league_id", league.id)
    .eq("is_active", true);

  if (error) {
    console.error("Erro ao buscar jogadores:", error);
    return [];
  }

  return (data || [])
    .map(playerWithLeagueProfile)
    .filter((player): player is Player => {
      if (!player) return false;
      return !selectableOnly || (player.is_selectable && ["player", "guest"].includes(player.member_category));
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Atletas que pertencem à liga da convocação e podem ocupar uma vaga. */
export async function getSelectableLeaguePlayers(leagueId: string) {
  const league = await getSelectedLeague();
  if (!league || league.id !== leagueId) return [] as Player[];
  const client = await createServerClient();
  const { data, error } = await client
    .from("league_members")
    .select("player_profile, initial_player_profile, overall_traits, overall_seed_mode, players(*)")
    .eq("league_id", leagueId)
    .eq("is_active", true)
    .order("joined_at");

  if (error) {
    console.error("Erro ao buscar elenco elegível da liga:", error);
    return [] as Player[];
  }

  return (data || [])
    .map(playerWithLeagueProfile)
    .filter((player): player is Player => {
      if (!player) return false;
      return player.is_selectable && ["player", "guest"].includes(player.member_category);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function getPlayer(id: string) {
  const league = await getSelectedLeague();
  if (!league) return null;
  const client = await createServerClient();
  const { data: membership } = await client.from("league_members")
    .select("player_id, player_profile, initial_player_profile, overall_traits, overall_seed_mode")
    .eq("league_id", league.id).eq("player_id", id).eq("is_active", true).maybeSingle();
  if (!membership) return null;
  const { data, error } = await client
    .from("players")
    .select(`
      id,
      name,
      nickname,
      avatar_url,
      avatar_alternate_url,
      profile_bio,
      player_profile,
      initial_player_profile,
      profile_decision_source,
      profile_source_round_id,
      overall_traits,
      overall_seed_mode,
      is_goalkeeper,
      member_category,
      is_selectable,
      registration_source,
      created_at
    `)
    .eq("id", id)
    .single();

  if (error) {
    console.error("Erro ao buscar jogador:", error);
    return null;
  }

  return playerWithLeagueProfile({ ...membership, players: data });
}

const getPlayersForStatsCached = cache(async (selectableOnly: boolean) => {
  return { data: await getPlayers(selectableOnly), error: null };
});

export async function getPlayersWithStats(roundType: RoundType = "official", selectableOnly = false) {
  const season = await getActiveSeason();
  const client = await createServerClient();

  // 1. Tentar buscar jogadores e stats agregados via View SQL
  if (season) {
    const viewStartedAt = performance.now();
    const playersQuery = getPlayersForStatsCached(selectableOnly);

    const statsQuery = readSeasonPlayerTotals(client, season.id, roundType);

    const [playersResult, statsResult] = await Promise.all([playersQuery, statsQuery]);
    if (playersResult.error) {
      logStatsQuery("roster_totals", "season_view", viewStartedAt, statsResult.data?.length || 0, true);
    }

    if (!playersResult.error && !statsResult.error && playersResult.data) {
      const playersWithStats = buildPlayerSeasonStatistics(
        playersResult.data as Player[],
        statsResult.data || [],
        roundType,
      );

      return playersWithStats.sort((a, b) => b.points - a.points);
    }
  }

  // Fallback seguro se a view ainda não estiver criada no banco
  const [playersResult, roundIds] = await Promise.all([
    getPlayersForStatsCached(selectableOnly),
    getActiveSeasonRoundIds(season?.league_id, roundType),
  ]);
  const { data: players, error: playersError } = playersResult;

  if (playersError || !players) {
    if (playersError) console.error("Erro ao buscar jogadores:", playersError);
    return [];
  }

  const fallbackStartedAt = performance.now();
  const [statsResult, finishedRoundsResult] = roundIds.length > 0
    ? await Promise.all([
      client.from("player_round_stats")
        .select("player_id, round_id, games, goals, assists, wins, draws, losses, points, ranking_points")
        .in("round_id", roundIds),
      client.from("rounds").select("id").in("id", roundIds).eq("status", "finished"),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  logStatsQuery("roster_totals", "round_stats", fallbackStartedAt, statsResult.data?.length || 0, Boolean(statsResult.error || finishedRoundsResult.error));
  const { data: stats, error: statsError } = statsResult;

  const finishedRoundIds = finishedRoundsResult.data?.map((round) => round.id) || [];
  const attendanceResult = finishedRoundIds.length > 0
    ? await client.from("round_players").select("player_id, round_id").in("round_id", finishedRoundIds)
    : { data: [], error: null };
  const { data: attendance, error: attendanceError } = attendanceResult;

  if (statsError || finishedRoundsResult.error || attendanceError) {
    console.error("Erro ao buscar dados complementares de jogadores:", statsError || finishedRoundsResult.error || attendanceError);
    return [];
  }

  const statsByPlayer = new Map<string, typeof stats>();
  for (const stat of stats || []) {
    const playerStats = statsByPlayer.get(stat.player_id) || [];
    playerStats.push(stat);
    statsByPlayer.set(stat.player_id, playerStats);
  }
  const roundsByPlayer = new Map<string, Set<string>>();
  for (const entry of attendance || []) {
    const playerRounds = roundsByPlayer.get(entry.player_id) || new Set<string>();
    playerRounds.add(entry.round_id);
    roundsByPlayer.set(entry.player_id, playerRounds);
  }

  const playersWithStats = players.map((player) => {
    const playerStats = statsByPlayer.get(player.id) || [];
    
    const aggregated = playerStats.reduce(
      (acc, curr) => ({
        games: acc.games + curr.games,
        goals: acc.goals + curr.goals,
        assists: acc.assists + curr.assists,
        wins: acc.wins + curr.wins,
        draws: acc.draws + curr.draws,
        losses: acc.losses + curr.losses,
        points: acc.points + canonicalRoundPoints(curr, roundType),
        legacyPoints: acc.legacyPoints + Number(curr.points || 0),
      }),
      { games: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0, points: 0, legacyPoints: 0 }
    );

    return {
      ...player,
      rounds: roundsByPlayer.get(player.id)?.size || 0,
      ...aggregated,
    };
  });

  return playersWithStats.sort((a, b) => b.points - a.points);
}

export async function getPlayerRoundHistory(playerId: string, roundType: RoundType = "official") {
  const roundIds = await getActiveSeasonRoundIds(undefined, roundType);
  if (roundIds.length === 0) return [];
  const client = await createServerClient();
  const { data, error } = await readPlayerRoundHistoryRows(client, playerId, roundIds);

  if (error) {
    console.error("Erro ao buscar histórico do jogador:", error);
    return [];
  }

  return (data || []).map((row: any) => {
    const round = Array.isArray(row.rounds) ? row.rounds[0] : row.rounds;
    const pointBreakdown = buildRankedPointBreakdown({
      goals: row.goals,
      assists: row.assists,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goalkeeperAppearances: row.goalkeeper_games,
      goalkeeperGoalsConceded: row.goals_conceded,
      goalkeeperGoals: row.goalkeeper_goals,
      goalkeeperAssists: row.goalkeeper_assists,
      goalkeeperOwnGoals: row.goalkeeper_own_goals,
      goalkeeperCleanSheets: row.clean_sheets,
      teamGoalsConceded: row.team_goals_conceded,
      defensiveCleanGames: row.ranking_defensive_clean_games,
      defensiveOneGoalGames: row.ranking_defensive_one_goal_games,
      lineRole: row.player_profile_locked === "defensive" ? "DEF" : "ATA",
      ownGoals: row.own_goals,
    }, normalizeBQScoringSnapshot(round?.scoring_snapshot));
    const positionBonus = roundRankingPoints(Number(row.ranking_position_bonus || 0));
    if (positionBonus !== 0) pointBreakdown.push({ label: "Bônus posicional", count: 1, points: positionBonus });
    const legacyPoints = Number(row.points || 0);
    const canonicalPoints = canonicalRoundPoints(row, roundType);
    return {
      ...row,
      rounds: round,
      legacy_points: roundRankingPoints(legacyPoints),
      points: roundRankingPoints(canonicalPoints),
      ranking_points: roundRankingPoints(canonicalPoints),
      point_breakdown: pointBreakdown,
    };
  });
}

export async function getPlayerPlaytime(playerId: string) {
  const league = await getSelectedLeague();
  if (!league) return { totalSeconds: 0, officialSeconds: 0, friendlySeconds: 0 };
  const client = await createServerClient();
  const { data, error } = await client
    .from("match_players")
    .select("entered_elapsed_seconds, left_elapsed_seconds, matches!inner(started_at, finished_at, timer_started_at, timer_accumulated_seconds, rounds!inner(round_type, league_id))")
    .eq("player_id", playerId)
    .eq("matches.rounds.league_id", league.id);

  if (error) {
    console.error("Erro ao buscar tempo de jogo do jogador:", error);
    return { totalSeconds: 0, officialSeconds: 0, friendlySeconds: 0 };
  }

  const totals = { totalSeconds: 0, officialSeconds: 0, friendlySeconds: 0 };
  for (const row of (data || []) as any[]) {
    const match = Array.isArray(row.matches) ? row.matches[0] : row.matches;
    if (!match || !match.started_at) continue;
    const elapsed = getMatchElapsedSeconds(match);
    const entered = Math.max(0, Number(row.entered_elapsed_seconds || 0));
    const left = row.left_elapsed_seconds == null ? elapsed : Math.max(entered, Number(row.left_elapsed_seconds));
    const played = Math.max(0, left - entered);
    const rounds = Array.isArray(match.rounds) ? match.rounds[0] : match.rounds;
    if (rounds?.round_type === "friendly") totals.friendlySeconds += played;
    else totals.officialSeconds += played;
    totals.totalSeconds += played;
  }
  return totals;
}

export type PlayerClubGoals = {
  key: string;
  name: string;
  color: string;
  crestUrl: string | null;
  officialGoals: number;
  friendlyGoals: number;
  totalGoals: number;
};

export async function getPlayerGoalsByClub(playerId: string): Promise<PlayerClubGoals[]> {
  const league = await getSelectedLeague();
  if (!league) return [];
  const client = await createServerClient();
  const { data, error } = await client
    .from("match_events")
    .select(`
      team:team_id (id, name, color, crest_url),
      match:match_id!inner (
        round:round_id!inner (round_type, league_id)
      )
    `)
    .eq("player_id", playerId)
    .eq("event_type", "goal")
    .eq("match.round.league_id", league.id);

  if (error) {
    console.error("Erro ao buscar gols por clube:", error);
    return [];
  }

  const goalsByClub = new Map<string, PlayerClubGoals>();
  for (const event of (data || []) as any[]) {
    const team = event.team;
    if (!team) continue;
    const preset = TEAM_PRESETS.find((item) => item.crestUrl && item.crestUrl === team.crest_url);
    const key = team.crest_url || `legacy:${String(team.name).toLocaleLowerCase("pt-BR")}:${team.color}`;
    const current = goalsByClub.get(key) || {
      key,
      name: preset?.name || team.name,
      color: preset?.color || team.color,
      crestUrl: team.crest_url || null,
      officialGoals: 0,
      friendlyGoals: 0,
      totalGoals: 0,
    };
    const roundType = event.match?.round?.round_type === "friendly" ? "friendly" : "official";
    if (roundType === "friendly") current.friendlyGoals += 1;
    else current.officialGoals += 1;
    current.totalGoals += 1;
    goalsByClub.set(key, current);
  }

  return [...goalsByClub.values()].sort((a, b) => b.totalGoals - a.totalGoals || a.name.localeCompare(b.name, "pt-BR"));
}

export async function getPlayerAwardSeasons(playerId: string) {
  const league = await getSelectedLeague();
  if (!league) return [];
  const client = await createServerClient();
  const [seasonsResult, roundsResult] = await Promise.all([
    client.from("seasons").select("id, number, status").eq("league_id", league.id),
    client
      .from("rounds")
      .select("id, number, date, season_id, best_goalkeeper_player_id, round_type")
      .eq("status", "finished")
      .eq("round_type", "official")
      .eq("league_id", league.id)
      .order("date", { ascending: false }),
  ]);

  if (seasonsResult.error || roundsResult.error) {
    console.error("Erro ao buscar histórico de insígnias:", seasonsResult.error || roundsResult.error);
    return [];
  }

  const rounds = roundsResult.data || [];
  if (rounds.length === 0) return [];

  const { data: stats, error: statsError } = await client
    .from("player_round_stats")
    .select("round_id, player_id, goals, assists, games, defensive_clean_games, defensive_one_goal_games, team_goals_conceded, player:player_id(player_profile, member_category, is_selectable)")
    .in("round_id", rounds.map((round) => round.id));

  if (statsError) {
    console.error("Erro ao calcular histórico de insígnias:", statsError);
    return [];
  }

  const seasonsById = new Map((seasonsResult.data || []).map((season) => [season.id, season]));
  const awardSeasons = buildAwardSeasonsByPlayer(
    rounds.flatMap((round) => {
      const season = seasonsById.get(round.season_id);
      return season ? [{
        id: round.id,
        number: round.number,
        date: round.date,
        seasonId: season.id,
        seasonNumber: season.number,
        seasonStatus: season.status as SeasonStatus,
        bestGoalkeeperPlayerId: round.best_goalkeeper_player_id,
      }] : [];
    }),
    (stats || []).map((stat: any) => ({
      ...stat,
      player: Array.isArray(stat.player) ? stat.player[0] || null : stat.player,
    })),
  );

  return awardSeasons.get(playerId) || [];
}

export async function getPlayerMonthlyAwards(playerId: string) {
  const league = await getSelectedLeague();
  if (!league) return [];
  const client = await createServerClient();
  const { data, error } = await client.rpc("get_monthly_awards_for_player_in_league", {
    p_league_id: league.id,
    p_player_id: playerId,
  });
  if (error) {
    // Compatibilidade durante o intervalo entre o deploy do app e a migration.
    if (error.code !== "PGRST202" && error.code !== "42883") console.error("Erro ao buscar prêmios mensais:", error);
    return [];
  }
  return parseMonthlyAwards(data);
}

export async function getPlayerAchievementBelts(playerId: string): Promise<PlayerAchievementBelt[]> {
  const season = await getActiveSeason();
  if (!season) return [];

  const client = await createServerClient();
  const { data, error } = await client.rpc("get_player_achievement_belts", {
    p_player_id: playerId,
    p_league_id: season.league_id,
  });
  if (error) {
    // Compatibilidade entre o deploy do app e a aplicação da migration.
    if (error.code !== "PGRST202" && error.code !== "42883") {
      console.error("Erro ao buscar cinturões do jogador:", error);
    }
    return [];
  }

  return parseAchievementBelts(data);
}

export async function getPreviousMonthAwardWinners() {
  const periodStart = previousMonthStart();
  const league = await getSelectedLeague();
  if (!league) return { periodStart, winners: [] };
  const client = await createServerClient();
  const { data, error } = await client.rpc("get_monthly_award_winners_for_league", {
    p_league_id: league.id,
    p_period_start: periodStart,
  });

  if (error) {
    console.error("Erro ao buscar os melhores do mês:", error);
    return { periodStart, winners: [] };
  }

  return { periodStart, winners: parseMonthlyAwardWinners(data) };
}

export async function createPlayer(input: CreatePlayerInput) {
  const account = await getCurrentAccount();
  const league = await getSelectedLeague();
  if (!account.user || !league || league.role !== "admin") {
    return { success: false, error: "Escolha uma pelada que você administra." };
  }
  const client = account.client;

  const { data, error } = await client
    .from("players")
    .insert([
      {
        name: input.name,
        nickname: input.nickname || null,
        avatar_url: input.avatar_url || null,
        player_profile: normalizeLineProfile(input.player_profile),
        overall_traits: normalizeOverallTraits(input.overall_traits),
        is_goalkeeper: false,
        member_category: input.member_category || "player",
        is_selectable: input.member_category === "wag" || input.member_category === "supporter"
          ? false
          : true,
        registration_source: "admin",
        created_by_user_id: account.user.id,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar jogador:", error);
    return { success: false, error: error.message };
  }

  const { error: membershipError } = await client.from("league_members").insert({
    league_id: league.id,
    player_id: data.id,
    role: "player",
    is_active: true,
    player_profile: normalizeLineProfile(input.player_profile),
    initial_player_profile: normalizeLineProfile(input.player_profile),
    overall_traits: normalizeOverallTraits(input.overall_traits),
    overall_seed_mode: "observed",
  });
  if (membershipError) {
    await client.from("players").delete().eq("id", data.id);
    return { success: false, error: membershipError.message };
  }

  revalidatePlayerPaths(data.id);
  return { success: true, data };
}

export async function updatePlayer(id: string, input: Partial<CreatePlayerInput>) {
  const account = await getCurrentAccount();
  const league = await getSelectedLeague();
  if (!account.user || !league || league.role !== "admin") {
    return { success: false, error: "Somente administradores desta pelada podem editar jogadores." };
  }
  const client = account.client;
  if (!(await playerBelongsToSelectedLeague(id, client))) {
    return { success: false, error: "Jogador não pertence à pelada selecionada." };
  }

  const playerInput = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.nickname !== undefined ? { nickname: input.nickname.trim() || null } : {}),
    ...(input.avatar_url !== undefined ? { avatar_url: input.avatar_url || null } : {}),
    ...(input.member_category !== undefined ? { member_category: input.member_category } : {}),
    ...(input.is_selectable !== undefined ? { is_selectable: input.is_selectable } : {}),
  };
  const membershipInput = {
    ...(input.player_profile !== undefined ? {
      player_profile: normalizeLineProfile(input.player_profile),
      initial_player_profile: normalizeLineProfile(input.player_profile),
    } : {}),
    ...(input.overall_traits !== undefined ? { overall_traits: normalizeOverallTraits(input.overall_traits) } : {}),
  };

  const playerKeys = Object.keys(playerInput);
  if (playerKeys.length) {
    const { error } = await client.from("players").update(playerInput).eq("id", id);
    if (error) {
      console.error("Erro ao atualizar jogador:", error);
      return { success: false, error: error.message };
    }
  }
  if (Object.keys(membershipInput).length) {
    const { error } = await client.from("league_members").update(membershipInput)
      .eq("league_id", league.id).eq("player_id", id).eq("is_active", true);
    if (error) {
      console.error("Erro ao atualizar perfil do jogador na pelada:", error);
      return { success: false, error: error.message };
    }
  }

  revalidatePlayerPaths(id);
  return { success: true, data: await getPlayer(id) };
}

export async function savePlayer(playerId: string | null, formData: FormData) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Sessão expirada. Entre novamente." };

  const selectedLeague = await getSelectedLeague();
  const isLeagueAdmin = selectedLeague?.role === "admin";
  const ownsPlayer = !!playerId && account.profile?.player_id === playerId;
  if (!isLeagueAdmin && !ownsPlayer) {
    return { success: false, error: "Você só pode editar o seu próprio perfil." };
  }
  if (!playerId && !isLeagueAdmin) {
    return { success: false, error: "Somente administradores podem criar jogadores." };
  }
  const client = account.client;
  if (playerId && !(await playerBelongsToSelectedLeague(playerId, client))) {
    return { success: false, error: "Jogador não pertence à pelada selecionada." };
  }
  if (!playerId && !selectedLeague) {
    return { success: false, error: "Selecione uma pelada antes de criar jogadores." };
  }

  const name = String(formData.get("name") || "").trim();
  const nickname = String(formData.get("nickname") || "").trim();
  const profileBio = String(formData.get("profile_bio") || "").trim();
  const playerProfile = normalizeLineProfile(String(formData.get("player_profile") || "offensive") as PlayerProfile);
  const requestedOverallTraits = normalizeOverallTraits(formData.getAll("overall_traits"));
  const requestedCategory = String(formData.get("member_category") || "player") as MemberCategory;
  const requestedSelectable = formData.get("is_selectable") !== "false";
  // Mantemos compatibilidade com o campo avatar da versão anterior do perfil.
  const removeActiveAvatar = formData.get("remove_active_avatar") === "true" || formData.get("remove_avatar") === "true";
  const removeAlternateAvatar = formData.get("remove_alternate_avatar") === "true";
  const useAlternateAvatar = formData.get("use_alternate_avatar") === "true";
  const legacyAvatar = formData.get("avatar");
  const requestedActiveAvatar = formData.get("avatar_active");
  const requestedAlternateAvatar = formData.get("avatar_alternate");
  const activeAvatar = requestedActiveAvatar instanceof File && requestedActiveAvatar.size > 0
    ? requestedActiveAvatar
    : legacyAvatar instanceof File && legacyAvatar.size > 0
      ? legacyAvatar
      : null;
  const alternateAvatar = requestedAlternateAvatar instanceof File && requestedAlternateAvatar.size > 0
    ? requestedAlternateAvatar
    : null;
  const avatarUploads = [activeAvatar, alternateAvatar].filter((file): file is File => file instanceof File);

  if (!["player", "guest", "wag", "supporter"].includes(requestedCategory)) {
    return { success: false, error: "Escolha uma categoria valida." };
  }
  if (!["offensive", "defensive"].includes(playerProfile)) {
    return { success: false, error: "Escolha um perfil de jogo valido." };
  }
  if (isLeagueAdmin && requestedOverallTraits.length > 2) {
    return { success: false, error: "Escolha no máximo duas características: principal e secundária." };
  }

  if (!name) return { success: false, error: "O nome é obrigatório." };
  if (name.length > 120) return { success: false, error: "O nome deve ter no máximo 120 caracteres." };
  if (nickname.length > 60) return { success: false, error: "O apelido deve ter no máximo 60 caracteres." };
  if (profileBio.length > 500) return { success: false, error: "O texto do perfil deve ter no máximo 500 caracteres." };

  for (const avatar of avatarUploads) {
    if (!AVATAR_EXTENSIONS[avatar.type]) {
      return { success: false, error: "Use uma imagem JPG, PNG ou WebP." };
    }
    if (avatar.size > MAX_AVATAR_SIZE) {
      return { success: false, error: "A foto deve ter no máximo 5 MB." };
    }
  }

  let currentAvatarUrl: string | null = null;
  let currentAlternateAvatarUrl: string | null = null;
  let currentCategory: MemberCategory = "player";
  let currentSelectable = true;
  let currentPlayerProfile: PlayerProfile | null = "offensive";
  let currentIsGoalkeeper = false;
  let currentOverallTraits: PlayerProfile[] = [];
  const id = playerId || crypto.randomUUID();

  if (playerId) {
    const [{ data: currentPlayer, error: currentPlayerError }, { data: currentMembership, error: membershipError }] = await Promise.all([
      client.from("players")
        .select("avatar_url, avatar_alternate_url, member_category, is_selectable, player_profile, overall_traits, is_goalkeeper")
        .eq("id", playerId).single(),
      client.from("league_members")
        .select("player_profile, overall_traits")
        .eq("league_id", selectedLeague!.id).eq("player_id", playerId).eq("is_active", true).single(),
    ]);

    if (currentPlayerError || membershipError) {
      return { success: false, error: "Jogador não encontrado." };
    }
    currentAvatarUrl = currentPlayer.avatar_url;
    currentAlternateAvatarUrl = currentPlayer.avatar_alternate_url || null;
    currentCategory = currentPlayer.member_category as MemberCategory;
    currentSelectable = currentPlayer.is_selectable;
    currentPlayerProfile = (currentMembership.player_profile ?? currentPlayer.player_profile) as PlayerProfile | null;
    currentOverallTraits = normalizeOverallTraits(currentMembership.overall_traits ?? currentPlayer.overall_traits);
    currentIsGoalkeeper = Boolean(currentPlayer.is_goalkeeper);
  }

  const uploadedPaths: string[] = [];
  let nextAvatarUrl = removeActiveAvatar ? null : currentAvatarUrl;
  let nextAlternateAvatarUrl = removeAlternateAvatar ? null : currentAlternateAvatarUrl;

  for (const [slot, avatar] of [["active", activeAvatar], ["alternate", alternateAvatar]] as const) {
    if (!avatar) continue;
    const extension = AVATAR_EXTENSIONS[avatar.type];
    const uploadedPath = `${id}/${crypto.randomUUID()}.${extension}`;
    const bytes = await avatar.arrayBuffer();
    const { error: uploadError } = await client.storage
      .from(AVATAR_BUCKET)
      .upload(uploadedPath, bytes, {
        contentType: avatar.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      if (uploadedPaths.length) await client.storage.from(AVATAR_BUCKET).remove(uploadedPaths);
      console.error("Erro ao enviar foto do jogador:", uploadError);
      return { success: false, error: `Não foi possível enviar a foto: ${uploadError.message}` };
    }

    uploadedPaths.push(uploadedPath);
    const publicUrl = client.storage.from(AVATAR_BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
    if (slot === "active") nextAvatarUrl = publicUrl;
    else nextAlternateAvatarUrl = publicUrl;
  }

  // A troca é pedida no perfil e só é persistida ao salvar. Fazemos isso após
  // receber uploads/remoções para que as duas vagas continuem coerentes.
  if (useAlternateAvatar && nextAlternateAvatarUrl) {
    [nextAvatarUrl, nextAlternateAvatarUrl] = [nextAlternateAvatarUrl, nextAvatarUrl];
  }

  // A primeira vaga é sempre a foto ativa. Se ela for removida e houver uma
  // extra salva, promovemos a extra automaticamente para não deixar o perfil
  // sem foto por acidente.
  if (!nextAvatarUrl && nextAlternateAvatarUrl) {
    nextAvatarUrl = nextAlternateAvatarUrl;
    nextAlternateAvatarUrl = null;
  }
  if (nextAvatarUrl && nextAvatarUrl === nextAlternateAvatarUrl) nextAlternateAvatarUrl = null;

  const memberCategory = isLeagueAdmin ? requestedCategory : currentCategory;
  const isSelectable = isLeagueAdmin
    ? (memberCategory === "wag" || memberCategory === "supporter" ? false : memberCategory === "guest" ? true : requestedSelectable)
    : currentSelectable;
  const overallTraits = memberCategory === "wag" || memberCategory === "supporter"
    ? []
    : isLeagueAdmin ? requestedOverallTraits : currentOverallTraits;
  const playerData = {
    id,
    name,
    nickname: nickname || null,
    ...(isLeagueAdmin ? { profile_bio: profileBio || null } : {}),
    avatar_url: nextAvatarUrl,
    avatar_alternate_url: nextAlternateAvatarUrl,
    player_profile: memberCategory === "wag" || memberCategory === "supporter"
      ? null
      : isLeagueAdmin ? playerProfile : currentPlayerProfile,
    overall_traits: overallTraits,
    // GOL deixou de ser uma tag de perfil. Mantemos o valor legado apenas para
    // o histórico operacional de partidas, sem expor ou editar pelo app.
    is_goalkeeper: memberCategory === "wag" || memberCategory === "supporter"
      ? false
      : currentIsGoalkeeper,
    member_category: memberCategory,
    is_selectable: isSelectable,
    ...(playerId ? {} : { registration_source: "admin", created_by_user_id: account.user.id }),
  };

  const query = playerId
    ? client.from("players").update({
        name: playerData.name,
        nickname: playerData.nickname,
        ...(isLeagueAdmin ? { profile_bio: playerData.profile_bio } : {}),
        avatar_url: playerData.avatar_url,
        avatar_alternate_url: playerData.avatar_alternate_url,
        is_goalkeeper: playerData.is_goalkeeper,
        member_category: playerData.member_category,
        is_selectable: playerData.is_selectable,
      }).eq("id", id)
    : client.from("players").insert([playerData]);

  const { error: saveError } = await query;

  if (saveError) {
    if (uploadedPaths.length) await client.storage.from(AVATAR_BUCKET).remove(uploadedPaths);
    console.error("Erro ao salvar jogador:", saveError);
    return { success: false, error: saveError.message };
  }

  if (!playerId) {
    const league = selectedLeague;
    if (!league || league.role !== "admin") return { success: false, error: "Escolha uma pelada que você administra." };
    const { error: membershipError } = await client.from("league_members").insert({
      league_id: league.id,
      player_id: id,
      role: "player",
      is_active: true,
      player_profile: playerData.player_profile,
      initial_player_profile: playerData.player_profile,
      overall_traits: playerData.overall_traits,
      overall_seed_mode: "observed",
    });
    if (membershipError) {
      await client.from("players").delete().eq("id", id);
      return { success: false, error: membershipError.message };
    }
  } else if (isLeagueAdmin) {
    const { error: membershipError } = await client.from("league_members").update({
      player_profile: playerData.player_profile,
      initial_player_profile: playerData.player_profile,
      overall_traits: playerData.overall_traits,
    }).eq("league_id", selectedLeague!.id).eq("player_id", id).eq("is_active", true);
    if (membershipError) {
      return { success: false, error: membershipError.message };
    }
  }

  const retainedAvatarUrls = new Set([nextAvatarUrl, nextAlternateAvatarUrl].filter((url): url is string => Boolean(url)));
  const previousAvatarUrls = [currentAvatarUrl, currentAlternateAvatarUrl]
    .filter((url): url is string => Boolean(url));
  const removedAvatarPaths = [...new Set(previousAvatarUrls
    .filter((url) => !retainedAvatarUrls.has(url))
    .map(avatarPathFromUrl)
    .filter((path): path is string => Boolean(path)))];
  if (removedAvatarPaths.length) {
    const { error: cleanupError } = await client.storage.from(AVATAR_BUCKET).remove(removedAvatarPaths);
    if (cleanupError) console.error("Erro ao remover foto antiga:", cleanupError);
  }

  revalidatePlayerPaths(id);
  return { success: true, data: { id } };
}

/** Alterna as duas fotos que já estão salvas, sem exigir que o usuário edite
 * ou envie novamente o restante do formulário. */
export async function swapPlayerAvatars(playerId: string) {
  const account = await getCurrentAccount();
  if (!account.user) return { success: false, error: "Sessão expirada. Entre novamente." };

  const ownsPlayer = account.profile?.player_id === playerId;
  if (!account.isAdmin && !ownsPlayer) {
    return { success: false, error: "Você só pode trocar a foto do seu próprio perfil." };
  }
  if (!(await playerBelongsToSelectedLeague(playerId, account.client))) {
    return { success: false, error: "Jogador não pertence à pelada selecionada." };
  }

  const { data: player, error: playerError } = await account.client
    .from("players")
    .select("avatar_url, avatar_alternate_url")
    .eq("id", playerId)
    .single();

  if (playerError || !player) return { success: false, error: "Jogador não encontrado." };
  if (!player.avatar_alternate_url) return { success: false, error: "Adicione uma foto extra antes de alternar." };

  const { error: updateError } = await account.client
    .from("players")
    .update({
      avatar_url: player.avatar_alternate_url,
      avatar_alternate_url: player.avatar_url || null,
    })
    .eq("id", playerId);

  if (updateError) {
    console.error("Erro ao alternar fotos do jogador:", updateError);
    return { success: false, error: updateError.message };
  }

  revalidatePlayerPaths(playerId);
  return { success: true };
}

export async function getRosterGroups(roundType: RoundType = "official") {
  const [players, overallByPlayer] = await Promise.all([
    getPlayersWithStats(roundType),
    roundType === "official" ? getLatestPlayerCardOverallMap() : Promise.resolve(new Map()),
  ]);
  const rosterPlayers = players.map((player) => {
    if (player.member_category !== "player") return player;
    const overall = overallByPlayer.get(player.id);
    return overall ? { ...player, overall: overall.overall, overallPositions: overall.positions } : player;
  });
  return {
    officialPlayers: rosterPlayers.filter((player) => player.member_category === "player"),
    activeGuests: rosterPlayers.filter((player) => player.member_category === "guest"),
    wags: rosterPlayers.filter((player) => player.member_category === "wag"),
    supporters: rosterPlayers.filter((player) => player.member_category === "supporter"),
  };
}

export async function deletePlayer(id: string) {
  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem excluir jogadores." };
  if (!(await playerBelongsToSelectedLeague(id, client))) {
    return { success: false, error: "Jogador não pertence à pelada selecionada." };
  }

  const { data: player } = await client
    .from("players")
    .select("avatar_url, avatar_alternate_url")
    .eq("id", id)
    .single();

  const { error } = await client
    .from("players")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Erro ao deletar jogador:", error);
    return { success: false, error: error.message };
  }

  const avatarPaths = [...new Set([player?.avatar_url, player?.avatar_alternate_url]
    .map((url) => avatarPathFromUrl(url || null))
    .filter((path): path is string => Boolean(path)))];
  if (avatarPaths.length) {
    const { error: storageError } = await client.storage.from(AVATAR_BUCKET).remove(avatarPaths);
    if (storageError) console.error("Erro ao remover foto do jogador:", storageError);
  }

  revalidatePlayerPaths(id);
  return { success: true };
}
