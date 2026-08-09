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
      .order("date", { ascending: true })
      .limit(1)
      .single();

    // 2. Última Rodada (finished) com partidas e times
    const lastRoundPromise = supabase
      .from("rounds")
      .select(`
        *,
        matches(*),
        teams(*)
      `)
      .eq("status", "finished")
      .eq("season_id", season.id)
      .order("date", { ascending: false })
      .limit(1)
      .single();

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
        teamA:team_a_id (id, name, color),
        teamB:team_b_id (id, name, color)
      `)
      .eq("status", "live")
      .eq("round.season_id", season.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const leaguePromise = supabase
      .from("leagues")
      .select("match_duration")
      .eq("id", season.league_id)
      .single();

    // 3. Ranking e Destaques
    const [
      { data: nextRoundData },
      { data: lastRoundData },
      { data: liveMatchData },
      { data: leagueData },
      ranking,
    ] = await Promise.all([
      nextRoundPromise,
      lastRoundPromise,
      liveMatchPromise,
      leaguePromise,
      getRanking(),
    ]);
    
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

    return {
      success: true,
      data: {
        nextRound: nextRoundData ? {
          ...nextRoundData,
          confirmedPlayers: nextRoundData.round_players?.[0]?.count || 0
        } : null,
        liveMatch: liveMatchData,
        matchDuration: leagueData?.match_duration || 7,
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
