"use server";

import { supabase } from "../supabase";

// Regras de Pontuação Padrão
const POINTS = {
  WIN: 3,
  DRAW: 1,
  LOSS: 0,
  GOAL: 2,
  ASSIST: 1,
};

export async function calculateRoundStats(roundId: string) {
  try {
    // 1. Buscar a rodada e todas as partidas finalizadas
    const { data: round, error } = await supabase
      .from("rounds")
      .select(`
        *,
        matches (
          *,
          match_events (*)
        ),
        teams (
          *,
          team_players (*)
        )
      `)
      .eq("id", roundId)
      .single();

    if (error || !round) throw new Error("Erro ao buscar rodada para estatísticas");

    const finishedMatches = round.matches.filter((m: any) => m.status === "finished");
    
    // Objeto temporário para acumular os stats de cada player_id
    const statsMap: Record<string, any> = {};

    // 2. Inicializar os jogadores da rodada
    for (const team of round.teams) {
      for (const tp of team.team_players) {
        if (!statsMap[tp.player_id]) {
          statsMap[tp.player_id] = {
            player_id: tp.player_id,
            round_id: roundId,
            league_id: round.league_id,
            games: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goals: 0,
            assists: 0,
            points: 0,
          };
        }
      }
    }

    // 3. Processar cada partida finalizada
    for (const match of finishedMatches) {
      const isDraw = match.score_a === match.score_b;
      const winnerId = isDraw ? null : (match.score_a > match.score_b ? match.team_a_id : match.team_b_id);
      const loserId = isDraw ? null : (match.score_a < match.score_b ? match.team_a_id : match.team_b_id);

      // Adicionar stats base de partida (win, draw, loss)
      const processTeamMatch = (teamId: string, result: 'win' | 'draw' | 'loss') => {
        const team = round.teams.find((t: any) => t.id === teamId);
        if (!team) return;
        for (const tp of team.team_players) {
          const s = statsMap[tp.player_id];
          if (!s) continue;
          s.games += 1;
          if (result === 'win') { s.wins += 1; s.points += POINTS.WIN; }
          if (result === 'draw') { s.draws += 1; s.points += POINTS.DRAW; }
          if (result === 'loss') { s.losses += 1; s.points += POINTS.LOSS; }
        }
      };

      processTeamMatch(match.team_a_id, isDraw ? 'draw' : (winnerId === match.team_a_id ? 'win' : 'loss'));
      processTeamMatch(match.team_b_id, isDraw ? 'draw' : (winnerId === match.team_b_id ? 'win' : 'loss'));

      // Processar eventos (gols e assistências)
      for (const ev of match.match_events) {
        if (ev.event_type === 'goal') {
          // Gols
          const scorer = statsMap[ev.player_id];
          if (scorer) {
            scorer.goals += 1;
            scorer.points += POINTS.GOAL;
          }
          // Assistências
          if (ev.assist_player_id) {
            const assister = statsMap[ev.assist_player_id];
            if (assister) {
              assister.assists += 1;
              assister.points += POINTS.ASSIST;
            }
          }
        }
      }
    }

    // 4. Salvar tudo (Upsert)
    const statsArray = Object.values(statsMap);
    if (statsArray.length > 0) {
      const { error: upsertError } = await supabase
        .from("player_round_stats")
        .upsert(statsArray, { onConflict: "player_id, round_id" });
        
      if (upsertError) throw new Error(upsertError.message);
    }

    return { success: true };

  } catch (err: any) {
    console.error("Erro calcular estatísticas:", err);
    return { success: false, error: err.message };
  }
}

export async function getRanking() {
  // O ideal em produção seria usar uma View SQL
  // Para o MVP, buscamos todos os stats e agrupamos no servidor
  const { data, error } = await supabase
    .from("player_round_stats")
    .select(`
      *,
      player:player_id (*)
    `);

  if (error) {
    console.error("Erro ao buscar ranking:", error);
    return [];
  }

  const map = new Map<string, any>();

  for (const row of data) {
    const pid = row.player_id;
    if (!map.has(pid)) {
      map.set(pid, {
        player: row.player,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals: 0,
        assists: 0,
        points: 0,
      });
    }

    const s = map.get(pid);
    s.games += row.games;
    s.wins += row.wins;
    s.draws += row.draws;
    s.losses += row.losses;
    s.goals += row.goals;
    s.assists += row.assists;
    s.points += row.points;
  }

  const ranking = Array.from(map.values());
  // Ordenar por pontos (desc), saldo de vitórias, gols (desc)
  ranking.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.goals - a.goals;
  });

  return ranking;
}
