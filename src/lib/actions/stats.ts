"use server";

import { supabase } from "../supabase";
import { getActiveSeason, getActiveSeasonRoundIds } from "./seasons";
import { getAdminClient } from "../auth";
import { DEFAULT_SCORING_POINTS } from "../scoring";
import type { EventType } from "../types";
import type { Player } from "../types";
import type { RankingAwards, RankingEntry, RankingExperienceData } from "../ranking";

type RankingStatsRow = {
  player_id: string;
  round_id: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  points: number;
  player: Player;
};

function sortRankingEntries<T extends Pick<RankingEntry, "points" | "wins" | "goals" | "assists">>(entries: T[]) {
  return [...entries].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goals !== a.goals) return b.goals - a.goals;
    return b.assists - a.assists;
  });
}

function aggregateRankingRows(rows: RankingStatsRow[]) {
  const map = new Map<string, Omit<RankingEntry, "awards" | "seasonPosition" | "positionChange">>();

  for (const row of rows) {
    const current = map.get(row.player_id) || {
      player: row.player,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      assists: 0,
      points: 0,
      winRate: 0,
    };

    current.games += row.games;
    current.wins += row.wins;
    current.draws += row.draws;
    current.losses += row.losses;
    current.goals += row.goals;
    current.assists += row.assists;
    current.points += row.points;
    current.winRate = current.games === 0
      ? 0
      : Math.round(((current.wins * 3 + current.draws) / (current.games * 3)) * 100);
    map.set(row.player_id, current);
  }

  return sortRankingEntries(Array.from(map.values()));
}

export async function calculateRoundStats(roundId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem recalcular estatisticas." };

    // 1. Buscar a rodada e todas as partidas finalizadas
    const { data: round, error } = await client
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

    const points = { ...DEFAULT_SCORING_POINTS };
    const { data: configuredRules, error: rulesError } = await client
      .from("ranking_rules")
      .select("event_type, points")
      .eq("league_id", round.league_id);

    if (rulesError) throw new Error(`Erro ao buscar regras de pontuação: ${rulesError.message}`);

    for (const rule of configuredRules || []) {
      if (rule.event_type in points) {
        points[rule.event_type as EventType] = rule.points;
      }
    }

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
          if (result === 'win') { s.wins += 1; s.points += points.win; }
          if (result === 'draw') { s.draws += 1; s.points += points.draw; }
          if (result === 'loss') { s.losses += 1; s.points += points.loss; }
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
            scorer.points += points.goal;
          }
          // Assistências
          if (ev.assist_player_id) {
            const assister = statsMap[ev.assist_player_id];
            if (assister) {
              assister.assists += 1;
              assister.points += points.assist;
            }
          }
        }
      }
    }

    const bestGoalkeeper = round.best_goalkeeper_player_id
      ? statsMap[round.best_goalkeeper_player_id]
      : null;
    if (bestGoalkeeper) {
      bestGoalkeeper.points += points.best_goalkeeper;
    }

    // 4. Salvar tudo (Upsert)
    const statsArray = Object.values(statsMap);
    if (statsArray.length > 0) {
      const { error: upsertError } = await client
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
  const roundIds = await getActiveSeasonRoundIds();
  if (roundIds.length === 0) return [];

  // O ideal em produção seria usar uma View SQL
  // Para o MVP, buscamos todos os stats e agrupamos no servidor
  const { data, error } = await supabase
    .from("player_round_stats")
    .select(`
      *,
      player:player_id (*)
    `)
    .in("round_id", roundIds);

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

export async function getRankingExperienceData(): Promise<RankingExperienceData> {
  const season = await getActiveSeason();
  const emptyData: RankingExperienceData = {
    seasonLabel: "Temporada atual",
    general: [],
    latestRound: null,
  };

  if (!season) return emptyData;

  const seasonYear = new Date(season.started_at).getFullYear();
  const seasonLabel = `Temporada ${season.number} · ${seasonYear}`;
  const { data: rounds, error: roundsError } = await supabase
    .from("rounds")
    .select("id, number, date, best_goalkeeper_player_id")
    .eq("season_id", season.id)
    .eq("status", "finished")
    .order("date", { ascending: false })
    .order("number", { ascending: false });

  if (roundsError || !rounds || rounds.length === 0) {
    if (roundsError) console.error("Erro ao buscar rodadas do ranking:", roundsError);
    return { ...emptyData, seasonLabel };
  }

  const { data: rawStats, error: statsError } = await supabase
    .from("player_round_stats")
    .select(`
      player_id,
      round_id,
      games,
      wins,
      draws,
      losses,
      goals,
      assists,
      points,
      player:player_id (*)
    `)
    .in("round_id", rounds.map((round) => round.id));

  if (statsError || !rawStats) {
    if (statsError) console.error("Erro ao buscar dados detalhados do ranking:", statsError);
    return { ...emptyData, seasonLabel };
  }

  const stats = rawStats as unknown as RankingStatsRow[];
  const latestRound = rounds[0];
  const generalBase = aggregateRankingRows(stats);
  const previousBase = aggregateRankingRows(stats.filter((row) => row.round_id !== latestRound.id));
  const latestBase = aggregateRankingRows(stats.filter((row) => row.round_id === latestRound.id));
  const previousPositions = new Map(previousBase.map((entry, index) => [entry.player.id, index + 1]));
  const seasonPositions = new Map(generalBase.map((entry, index) => [entry.player.id, index + 1]));
  const awards = new Map<string, RankingAwards>();

  function getAwards(playerId: string) {
    const current = awards.get(playerId) || {
      topScorer: 0,
      topAssister: 0,
      bestGoalkeeper: 0,
    };
    awards.set(playerId, current);
    return current;
  }

  for (const round of rounds) {
    const roundStats = stats.filter((row) => row.round_id === round.id);
    const mostGoals = Math.max(0, ...roundStats.map((row) => row.goals));
    const mostAssists = Math.max(0, ...roundStats.map((row) => row.assists));

    for (const row of roundStats) {
      const playerAwards = getAwards(row.player_id);
      if (mostGoals > 0 && row.goals === mostGoals) playerAwards.topScorer += 1;
      if (mostAssists > 0 && row.assists === mostAssists) playerAwards.topAssister += 1;
    }

    if (round.best_goalkeeper_player_id) {
      getAwards(round.best_goalkeeper_player_id).bestGoalkeeper += 1;
    }
  }

  const general = generalBase.map((entry, index): RankingEntry => {
    const previousPosition = previousPositions.get(entry.player.id);
    return {
      ...entry,
      awards: getAwards(entry.player.id),
      seasonPosition: index + 1,
      positionChange: previousPosition ? previousPosition - (index + 1) : null,
    };
  });

  const latestEntries = latestBase.map((entry): RankingEntry => ({
    ...entry,
    awards: getAwards(entry.player.id),
    seasonPosition: seasonPositions.get(entry.player.id) || general.length + 1,
    positionChange: general.find((item) => item.player.id === entry.player.id)?.positionChange ?? null,
  }));

  return {
    seasonLabel,
    general,
    latestRound: {
      id: latestRound.id,
      number: latestRound.number,
      date: latestRound.date,
      entries: latestEntries,
    },
  };
}
