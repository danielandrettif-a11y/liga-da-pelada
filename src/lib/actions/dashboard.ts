"use server";

import { supabase } from "../supabase";
import { getRanking } from "./stats";
import { getActiveSeason } from "./seasons";
import { getAllPlayersEquippedCosmeticsMap } from "./cosmetics";

export async function getDashboardData() {
  try {
    const season = await getActiveSeason();
    if (!season) throw new Error("Temporada ativa não encontrada. Execute a migration 005.");

    // 1. Próxima Rodada (draft ou active)
    const nextRoundPromise = supabase
      .from("rounds")
      .select("*, round_players(count)")
      .in("status", ["draft", "active"])
      .eq("season_id", season.id)
      .eq("round_type", "official")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1)
      .single();

    // 2. Última Rodada (finished) com partidas e times
    const lastRoundPromise = supabase
      .from("rounds")
      .select(`
        *,
        matches(
          *,
          match_events(
            id,
            match_id,
            event_type,
            player_id,
            assist_player_id,
            team_id,
            minute,
            player:player_id (id, name, avatar_url),
            assist_player:assist_player_id (id, name, avatar_url)
          )
        ),
        teams(*)
      `)
      .eq("status", "finished")
      .eq("season_id", season.id)
      .eq("round_type", "official")
      .order("date", { ascending: false })
      .limit(1)
      .single();

    const nextFriendlyPromise = supabase
      .from("rounds")
      .select("*, round_players(count)")
      .in("status", ["draft", "active"])
      .eq("season_id", season.id)
      .eq("round_type", "friendly")
      .order("date", { ascending: true })
      .limit(1)
      .maybeSingle();

    const liveMatchPromise = supabase
      .from("matches")
      .select(`
        id,
        score_a,
        score_b,
        status,
        timer_started_at,
        timer_accumulated_seconds,
        round:round_id!inner (id, number, season_id),
        teamA:team_a_id (id, name, color, crest_url),
        teamB:team_b_id (id, name, color, crest_url)
      `)
      .eq("status", "live")
      .eq("round.season_id", season.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const leaguePromise = supabase
      .from("leagues")
      .select("match_duration, preseason_enabled, stadium_name, stadium_map_url, event_duration_minutes")
      .eq("id", season.league_id)
      .single();

    const activeCallupsPromise = supabase
      .from("callups")
      .select("id, date, start_time, stadium_name, stadium_map_url, round_type, capacity, waitlist_capacity, callup_entries(player_id, status, position), round:round_id(id, status, matches(status))")
      .eq("league_id", season.league_id)
      .in("status", ["open", "locked"])
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    // 3. Ranking e Destaques
    const [
      { data: nextRoundData },
      { data: nextFriendlyData },
      { data: lastRoundData },
      { data: liveMatchData },
      { data: leagueData },
      { data: activeCallupsData },
      ranking,
      cosmeticsByPlayer,
    ] = await Promise.all([
      nextRoundPromise,
      nextFriendlyPromise,
      lastRoundPromise,
      liveMatchPromise,
      leaguePromise,
      activeCallupsPromise,
      getRanking(),
      getAllPlayersEquippedCosmeticsMap(),
    ]);

    const rankingWithCosmetics = ranking.map((entry) => ({
      ...entry,
      cosmetics: cosmeticsByPlayer.get(entry.player.id) || null,
    }));

    // Convocacoes ligadas a rodadas iniciadas/finalizadas deixam de ser destaque.
    const visibleCallups = (activeCallupsData || []).filter((callup: any) => {
      if (!callup.round) return true;
      const linkedRound: any = callup.round;
      const isRoundStarted = linkedRound.status === "in_progress" || linkedRound.status === "finished";
      const hasStartedMatches = (linkedRound.matches || []).some(
        (m: any) => m.status === "in_progress" || m.status === "live" || m.status === "finished"
      );
      return !isRoundStarted && !hasStartedMatches;
    });

    const mappedCallups = visibleCallups.map((callup: any) => ({
      id: callup.id,
      roundId: callup.round?.id || null,
      date: callup.date,
      startTime: callup.start_time || "08:00",
      stadiumName: callup.stadium_name || leagueData?.stadium_name || null,
      stadiumMapUrl: callup.stadium_map_url || leagueData?.stadium_map_url || null,
      roundType: callup.round_type,
      capacity: callup.capacity,
      waitlistCapacity: callup.waitlist_capacity,
      confirmed: (callup.callup_entries || []).filter((entry: any) => entry.status === "confirmed").length,
      waiting: (callup.callup_entries || []).filter((entry: any) => entry.status === "waitlist").length,
      entries: (callup.callup_entries || []).map((entry: any) => ({
        playerId: entry.player_id,
        status: entry.status as "confirmed" | "waitlist",
        position: entry.position,
      })),
    }));
    
    let topScorer = null;
    let topAssists = null;
    let topWins = null;

    if (rankingWithCosmetics.length > 0) {
      // Cria cópias para ordenar independentemente sem mutar a array original
      topScorer = [...rankingWithCosmetics].sort((a, b) => b.goals - a.goals)[0];
      topAssists = [...rankingWithCosmetics].sort((a, b) => b.assists - a.assists)[0];
      topWins = [...rankingWithCosmetics].sort((a, b) => b.wins - a.wins)[0];
    }

    // Processamento da Última Rodada (mapear os times nas partidas)
    let processedLastRound = null;
    if (lastRoundData) {
      const formattedMatches = lastRoundData.matches.map((m: any) => {
        const teamA = lastRoundData.teams.find((t: any) => t.id === m.team_a_id);
        const teamB = lastRoundData.teams.find((t: any) => t.id === m.team_b_id);
        return {
          ...m,
          teamA,
          teamB
        };
      });
      processedLastRound = {
        ...lastRoundData,
        matches: formattedMatches.sort((a: any, b: any) => (a.match_order || 0) - (b.match_order || 0))
      };
    }

    const matchingOfficialCallup = mappedCallups.find((callup) =>
      callup.roundType === "official" && (callup.roundId === nextRoundData?.id || callup.date === nextRoundData?.date),
    );
    const matchingFriendlyCallup = mappedCallups.find((callup) =>
      callup.roundType === "friendly" && (callup.roundId === nextFriendlyData?.id || callup.date === nextFriendlyData?.date),
    );
    const roundPlayersCount = nextRoundData?.round_players?.[0]?.count || 0;
    const effectiveConfirmed = roundPlayersCount > 0 ? roundPlayersCount : (matchingOfficialCallup?.confirmed || 0);

    const friendlyPlayersCount = nextFriendlyData?.round_players?.[0]?.count || 0;
    const effectiveFriendlyConfirmed = friendlyPlayersCount > 0 ? friendlyPlayersCount : (matchingFriendlyCallup?.confirmed || 0);

    return {
      success: true,
      data: {
        nextRound: nextRoundData ? {
          ...nextRoundData,
          confirmedPlayers: effectiveConfirmed
        } : null,
        nextFriendly: nextFriendlyData ? {
          ...nextFriendlyData,
          confirmedPlayers: effectiveFriendlyConfirmed,
        } : null,
        liveMatch: liveMatchData,
        matchDuration: leagueData?.match_duration || 7,
        venue: {
          name: leagueData?.stadium_name || null,
          mapUrl: leagueData?.stadium_map_url || null,
        },
        eventDurationMinutes: leagueData?.event_duration_minutes || 120,
        preseasonEnabled: leagueData?.preseason_enabled === true,
        activeCallup: mappedCallups[0] || null,
        activeCallups: mappedCallups,
        lastRound: processedLastRound,
        rankingPreview: rankingWithCosmetics.slice(0, 5),
        highlights: {
          topScorer: topScorer && topScorer.goals > 0 ? topScorer : null,
          topAssists: topAssists && topAssists.assists > 0 ? topAssists : null,
          topWins: topWins && topWins.wins > 0 ? topWins : null
        }
      }
    };
  } catch (err: any) {
    console.error("Erro ao buscar dados do dashboard:", err);
    return { success: false, error: err.message };
  }
}
