"use server";

import { supabase } from "../supabase";
import { getRanking } from "./stats";
import { getActiveSeason } from "./seasons";

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

    const activeCallupPromise = supabase
      .from("callups")
      .select("id, date, start_time, stadium_name, stadium_map_url, round_type, capacity, waitlist_capacity, callup_entries(player_id, status, position), round:round_id(id, status, matches(status))")
      .eq("league_id", season.league_id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Ranking e Destaques
    const [
      { data: nextRoundData },
      { data: nextFriendlyData },
      { data: lastRoundData },
      { data: liveMatchData },
      { data: leagueData },
      { data: activeCallupData },
      ranking,
    ] = await Promise.all([
      nextRoundPromise,
      nextFriendlyPromise,
      lastRoundPromise,
      liveMatchPromise,
      leaguePromise,
      activeCallupPromise,
      getRanking(),
    ]);

    // Se a rodada ligada a convocacao ja iniciou ou finalizou, ocultar convocacao
    let isCallupHidden = false;
    if (activeCallupData?.round) {
      const linkedRound: any = activeCallupData.round;
      const isRoundStarted = linkedRound.status === "in_progress" || linkedRound.status === "finished";
      const hasStartedMatches = (linkedRound.matches || []).some(
        (m: any) => m.status === "in_progress" || m.status === "finished"
      );
      if (isRoundStarted || hasStartedMatches) {
        isCallupHidden = true;
      }
    }
    
    let topScorer = null;
    let topAssists = null;
    let topWins = null;

    if (ranking && ranking.length > 0) {
      // Cria cópias para ordenar independentemente sem mutar a array original
      topScorer = [...ranking].sort((a, b) => b.goals - a.goals)[0];
      topAssists = [...ranking].sort((a, b) => b.assists - a.assists)[0];
      topWins = [...ranking].sort((a, b) => b.wins - a.wins)[0];
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

    const callupConfirmedCount = (activeCallupData?.callup_entries || []).filter(
      (entry: any) => entry.status === "confirmed"
    ).length;
    const roundPlayersCount = nextRoundData?.round_players?.[0]?.count || 0;
    const effectiveConfirmed = roundPlayersCount > 0 ? roundPlayersCount : (activeCallupData && !isCallupHidden ? callupConfirmedCount : 0);

    const friendlyPlayersCount = nextFriendlyData?.round_players?.[0]?.count || 0;
    const effectiveFriendlyConfirmed = friendlyPlayersCount > 0 ? friendlyPlayersCount : (activeCallupData && !isCallupHidden && activeCallupData.round_type === "friendly" ? callupConfirmedCount : 0);

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
        activeCallup: activeCallupData && !isCallupHidden ? {
          id: activeCallupData.id,
          date: activeCallupData.date,
          startTime: activeCallupData.start_time || "08:00",
          stadiumName: activeCallupData.stadium_name || leagueData?.stadium_name || null,
          stadiumMapUrl: activeCallupData.stadium_map_url || leagueData?.stadium_map_url || null,
          roundType: activeCallupData.round_type,
          capacity: activeCallupData.capacity,
          waitlistCapacity: activeCallupData.waitlist_capacity,
          confirmed: (activeCallupData.callup_entries || []).filter((entry: any) => entry.status === "confirmed").length,
          waiting: (activeCallupData.callup_entries || []).filter((entry: any) => entry.status === "waitlist").length,
          entries: (activeCallupData.callup_entries || []).map((entry: any) => ({
            playerId: entry.player_id,
            status: entry.status as "confirmed" | "waitlist",
            position: entry.position,
          })),
        } : null,
        lastRound: processedLastRound,
        rankingPreview: ranking.slice(0, 5),
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
