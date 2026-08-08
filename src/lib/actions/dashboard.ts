"use server";

import { supabase } from "../supabase";
import { getRanking } from "./stats";

export async function getDashboardData() {
  try {
    // 1. Próxima Rodada (draft ou active)
    const { data: nextRoundData } = await supabase
      .from("rounds")
      .select("*, round_players(count)")
      .in("status", ["draft", "active"])
      .order("date", { ascending: true })
      .limit(1)
      .single();

    // 2. Última Rodada (finished) com partidas e times
    const { data: lastRoundData } = await supabase
      .from("rounds")
      .select(`
        *,
        matches(*),
        teams(*)
      `)
      .eq("status", "finished")
      .order("date", { ascending: false })
      .limit(1)
      .single();

    // 3. Ranking e Destaques
    const ranking = await getRanking();
    
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
