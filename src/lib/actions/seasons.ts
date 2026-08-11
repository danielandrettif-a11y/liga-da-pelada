"use server";

import { revalidatePath } from "next/cache";
import { cache } from "react";
import { supabase } from "../supabase";
import { createClient as createServerClient } from "../supabase/server";
import type { RoundType, Season, SeasonPlayerSummary, SeasonSummary } from "../types";
import { getAdminClient } from "../auth";

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

const getActiveSeasonCached = cache(async (leagueId?: string) => {
  let resolvedLeagueId = leagueId;

  if (!resolvedLeagueId) {
    const { data: league } = await supabase
      .from("leagues")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();
    resolvedLeagueId = league?.id;
  }

  if (!resolvedLeagueId) return null;

  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .eq("league_id", resolvedLeagueId)
    .eq("status", "active")
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as Season;
});

export async function getActiveSeason(leagueId?: string) {
  return getActiveSeasonCached(leagueId);
}

const getActiveSeasonRoundIdsCached = cache(async (leagueId: string | undefined, roundType: RoundType) => {
  const season = await getActiveSeason(leagueId);
  if (!season) return [];

  const { data, error } = await supabase
    .from("rounds")
    .select("id")
    .eq("season_id", season.id)
    .eq("round_type", roundType);

  if (error) return [];
  return data.map((round) => round.id as string);
});

export async function getActiveSeasonRoundIds(leagueId?: string, roundType: RoundType = "official") {
  return getActiveSeasonRoundIdsCached(leagueId, roundType);
}

export async function getLatestFinishedSeason() {
  const { data: league } = await supabase
    .from("leagues")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!league) return null;

  const { data, error } = await supabase
    .from("seasons")
    .select("stats_snapshot")
    .eq("league_id", league.id)
    .eq("status", "finished")
    .not("stats_snapshot", "is", null)
    .order("number", { ascending: false })
    .limit(1)
    .single();

  if (error || !data?.stats_snapshot) return null;
  return data.stats_snapshot as unknown as SeasonSummary;
}

async function buildSeasonSummary(
  client: SupabaseClient,
  league: { id: string; name: string },
  season: Season,
): Promise<{ summary?: SeasonSummary; error?: string }> {
  const { data: rounds, error: roundsError } = await client
    .from("rounds")
    .select(`
      id,
      status,
      round_type,
      round_players (player_id),
      matches (
        id,
        status,
        match_events (id)
      )
    `)
    .eq("season_id", season.id);

  if (roundsError) return { error: roundsError.message };
  if (!rounds || rounds.length === 0) {
    return { error: "A temporada ainda não possui rodadas para arquivar." };
  }

  const unfinishedRounds = rounds.filter((round) => round.status !== "finished").length;
  if (unfinishedRounds > 0) {
    return { error: `Finalize ${unfinishedRounds === 1 ? "a rodada pendente" : `as ${unfinishedRounds} rodadas pendentes`} antes de terminar a temporada.` };
  }

  const officialRounds = rounds.filter((round) => round.round_type === "official");
  if (officialRounds.length === 0) return { error: "A temporada ainda não possui rodadas oficiais para arquivar." };
  const matches = officialRounds.flatMap((round) => round.matches || []);
  const unfinishedMatches = matches.filter((match) => match.status !== "finished").length;
  if (unfinishedMatches > 0) {
    return { error: `Finalize ${unfinishedMatches === 1 ? "a partida pendente" : `as ${unfinishedMatches} partidas pendentes`} antes de terminar a temporada.` };
  }

  const roundIds = officialRounds.map((round) => round.id);
  const { data: stats, error: statsError } = await client
    .from("player_round_stats")
    .select(`
      *,
      player:player_id (id, name, nickname)
    `)
    .in("round_id", roundIds);

  if (statsError) return { error: statsError.message };

  const players = new Map<string, SeasonPlayerSummary>();
  for (const row of stats || []) {
    const player = row.player as unknown as { id: string; name: string; nickname: string | null };
    if (!player) continue;

    const current = players.get(player.id) || {
      id: player.id,
      name: player.name,
      nickname: player.nickname,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      assists: 0,
      points: 0,
    };

    current.games += row.games;
    current.wins += row.wins;
    current.draws += row.draws;
    current.losses += row.losses;
    current.goals += row.goals;
    current.assists += row.assists;
    current.points += row.points;
    players.set(player.id, current);
  }

  const ranking = Array.from(players.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.goals - a.goals;
  });

  const participantIds = new Set(
    officialRounds.flatMap((round) => (round.round_players || []).map((item) => item.player_id)),
  );

  return {
    summary: {
      seasonId: season.id,
      seasonNumber: season.number,
      leagueName: league.name,
      startedAt: season.started_at,
      endedAt: new Date().toISOString(),
      roundCount: officialRounds.length,
      matchCount: matches.length,
      goalCount: matches.reduce((total, match) => total + (match.match_events?.length || 0), 0),
      playerCount: participantIds.size,
      ranking,
    },
  };
}

export async function finishSeason(confirmation: string) {
  if (confirmation !== "Terminar") {
    return { success: false, error: 'Digite exatamente "Terminar" para confirmar.' };
  }

  const client = await getAdminClient();
  if (!client) return { success: false, error: "Somente administradores podem terminar temporadas." };

  const { data: league, error: leagueError } = await client
    .from("leagues")
    .select("id, name")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (leagueError || !league) return { success: false, error: "Liga ativa não encontrada." };

  const { data: season, error: seasonError } = await client
    .from("seasons")
    .select("*")
    .eq("league_id", league.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (seasonError || !season) {
    return { success: false, error: "Temporada ativa não encontrada. Execute a migration 005." };
  }

  const result = await buildSeasonSummary(client, league, season as Season);
  if (!result.summary) return { success: false, error: result.error || "Erro ao gerar resumo." };

  const { data: finishResult, error: finishError } = await client.rpc("finish_season", {
    p_league_id: league.id,
    p_snapshot: result.summary,
  });

  if (finishError) {
    console.error("Erro ao terminar temporada:", finishError);
    return { success: false, error: finishError.message };
  }

  const transition = Array.isArray(finishResult) ? finishResult[0] : finishResult;
  revalidatePath("/");
  revalidatePath("/ranking");
  revalidatePath("/rodadas");
  revalidatePath("/jogadores");
  revalidatePath("/mais");

  return {
    success: true,
    summary: result.summary,
    newSeasonNumber: transition?.new_season_number || season.number + 1,
  };
}
