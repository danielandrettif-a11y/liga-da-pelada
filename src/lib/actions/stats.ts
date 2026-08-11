"use server";

import { supabase } from "../supabase";
import { getActiveSeason, getActiveSeasonRoundIds } from "./seasons";
import { getAdminClient, getCurrentAccount } from "../auth";
import { DEFAULT_SCORING_POINTS } from "../scoring";
import { buildAwardSeasonsByPlayer, countAwards } from "../awards";
import type { EventType, SeasonStatus } from "../types";
import type { Player } from "../types";
import type { RankingEntry, RankingExperienceData } from "../ranking";

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
  const map = new Map<string, Omit<RankingEntry, "awards" | "awardSeasons" | "seasonPosition" | "positionChange">>();

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
          match_events (*),
          match_players (*)
        ),
        round_players (*)
      `)
      .eq("id", roundId)
      .single();

    if (error || !round) throw new Error("Erro ao buscar rodada para estatísticas");
    const countsForRanking = round.round_type !== "friendly";

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

    // 2. Inicializar todos os inscritos, inclusive machucados e emprestados.
    for (const roundPlayer of round.round_players || []) {
      if (!statsMap[roundPlayer.player_id]) {
        statsMap[roundPlayer.player_id] = {
          player_id: roundPlayer.player_id,
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

    // 3. Processar cada partida finalizada
    for (const match of finishedMatches) {
      const isDraw = match.score_a === match.score_b;
      const winnerId = isDraw ? null : (match.score_a > match.score_b ? match.team_a_id : match.team_b_id);

      // Resultado vale somente para participantes marcados como elegiveis.
      const processTeamMatch = (teamId: string, result: 'win' | 'draw' | 'loss') => {
        const participants = (match.match_players || []).filter(
          (participant: any) => participant.team_id === teamId && participant.result_eligible,
        );
        for (const participant of participants) {
          const s = statsMap[participant.player_id];
          if (!s) continue;
          s.games += 1;
          if (result === 'win') { s.wins += 1; if (countsForRanking) s.points += points.win; }
          if (result === 'draw') { s.draws += 1; if (countsForRanking) s.points += points.draw; }
          if (result === 'loss') { s.losses += 1; if (countsForRanking) s.points += points.loss; }
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
            if (countsForRanking) scorer.points += points.goal;
          }
          // Assistências
          if (ev.assist_player_id) {
            const assister = statsMap[ev.assist_player_id];
            if (assister) {
              assister.assists += 1;
              if (countsForRanking) assister.points += points.assist;
            }
          }
        }
      }
    }

    const bestGoalkeeper = round.best_goalkeeper_player_id
      ? statsMap[round.best_goalkeeper_player_id]
      : null;
    if (bestGoalkeeper) {
      if (countsForRanking) bestGoalkeeper.points += points.best_goalkeeper;
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
  const { data: previousSeasons, error: previousSeasonError } = await supabase
    .from("seasons")
    .select("id, number, status")
    .eq("league_id", season.league_id)
    .eq("status", "finished")
    .order("number", { ascending: false })
    .limit(1);

  if (previousSeasonError) console.error("Erro ao buscar temporada anterior:", previousSeasonError);

  const visibleSeasons = [
    { id: season.id, number: season.number, status: season.status },
    ...(previousSeasons || []),
  ];
  const visibleSeasonsById = new Map(visibleSeasons.map((item) => [item.id, item]));
  const { data: rounds, error: roundsError } = await supabase
    .from("rounds")
    .select("id, number, date, season_id, best_goalkeeper_player_id")
    .in("season_id", visibleSeasons.map((item) => item.id))
    .eq("status", "finished")
    .eq("round_type", "official")
    .order("date", { ascending: false })
    .order("number", { ascending: false });

  const currentRounds = (rounds || []).filter((round) => round.season_id === season.id);
  if (roundsError || currentRounds.length === 0) {
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
    .in("round_id", (rounds || []).map((round) => round.id));

  if (statsError || !rawStats) {
    if (statsError) console.error("Erro ao buscar dados detalhados do ranking:", statsError);
    return { ...emptyData, seasonLabel };
  }

  const stats = rawStats as unknown as RankingStatsRow[];
  const currentRoundIds = new Set(currentRounds.map((round) => round.id));
  const currentStats = stats.filter((row) => currentRoundIds.has(row.round_id));
  const latestRound = currentRounds[0];
  const generalBase = aggregateRankingRows(currentStats);
  const previousBase = aggregateRankingRows(currentStats.filter((row) => row.round_id !== latestRound.id));
  const latestBase = aggregateRankingRows(currentStats.filter((row) => row.round_id === latestRound.id));
  const previousPositions = new Map(previousBase.map((entry, index) => [entry.player.id, index + 1]));
  const seasonPositions = new Map(generalBase.map((entry, index) => [entry.player.id, index + 1]));
  const awardSeasonsByPlayer = buildAwardSeasonsByPlayer(
    (rounds || []).flatMap((round) => {
      const roundSeason = visibleSeasonsById.get(round.season_id);
      return roundSeason ? [{
        id: round.id,
        number: round.number,
        date: round.date,
        seasonId: roundSeason.id,
        seasonNumber: roundSeason.number,
        seasonStatus: roundSeason.status as SeasonStatus,
        bestGoalkeeperPlayerId: round.best_goalkeeper_player_id,
      }] : [];
    }),
    stats,
  );
  const rankingAccount = await getCurrentAccount();
  const fitnessClient = rankingAccount.user ? rankingAccount.client : supabase;
  const { data: fitnessRows } = await fitnessClient
    .from("player_round_fitness")
    .select("player_id, distance_km, average_speed_kmh")
    .in("round_id", currentRounds.map((round) => round.id));
  const fitnessByPlayer = new Map<string, { distanceKm: number; speedTotal: number; entries: number }>();
  for (const row of fitnessRows || []) {
    const current = fitnessByPlayer.get(row.player_id) || { distanceKm: 0, speedTotal: 0, entries: 0 };
    current.distanceKm += Number(row.distance_km);
    current.speedTotal += Number(row.average_speed_kmh);
    current.entries += 1;
    fitnessByPlayer.set(row.player_id, current);
  }
  function getFitness(playerId: string) {
    const value = fitnessByPlayer.get(playerId);
    return value ? { distanceKm: Math.round(value.distanceKm * 100) / 100, averageSpeedKmh: Math.round((value.speedTotal / value.entries) * 100) / 100, entries: value.entries } : null;
  }

  function getAwardSeasons(playerId: string) {
    return awardSeasonsByPlayer.get(playerId) || [];
  }

  const general = generalBase.map((entry, index): RankingEntry => {
    const previousPosition = previousPositions.get(entry.player.id);
    return {
      ...entry,
      awards: countAwards(getAwardSeasons(entry.player.id), "active"),
      awardSeasons: getAwardSeasons(entry.player.id),
      seasonPosition: index + 1,
      positionChange: previousPosition ? previousPosition - (index + 1) : null,
      fitness: getFitness(entry.player.id),
    };
  });
  const generalByPlayer = new Map(general.map((entry) => [entry.player.id, entry]));

  const latestEntries = latestBase.map((entry): RankingEntry => ({
    ...entry,
    awards: countAwards(getAwardSeasons(entry.player.id), "active"),
    awardSeasons: getAwardSeasons(entry.player.id),
    seasonPosition: seasonPositions.get(entry.player.id) || general.length + 1,
    positionChange: generalByPlayer.get(entry.player.id)?.positionChange ?? null,
    fitness: getFitness(entry.player.id),
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

export type FriendlyStatsEntry = {
  player: Player;
  rounds: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  bestGoalkeeper: number;
};

export async function getFriendlyStats(): Promise<FriendlyStatsEntry[]> {
  const roundIds = await getActiveSeasonRoundIds(undefined, "friendly");
  if (roundIds.length === 0) return [];
  const [{ data: rows, error }, { data: rounds, error: roundsError }] = await Promise.all([
    supabase.from("player_round_stats").select(`
      player_id, round_id, games, wins, draws, losses, goals, assists,
      player:player_id (*)
    `).in("round_id", roundIds),
    supabase.from("rounds").select("id, best_goalkeeper_player_id").in("id", roundIds).eq("status", "finished"),
  ]);
  if (error || roundsError) {
    console.error("Erro ao buscar estatisticas de amistosos:", error || roundsError);
    return [];
  }
  const goalkeeperCounts = new Map<string, number>();
  for (const round of rounds || []) {
    if (round.best_goalkeeper_player_id) goalkeeperCounts.set(round.best_goalkeeper_player_id, (goalkeeperCounts.get(round.best_goalkeeper_player_id) || 0) + 1);
  }
  const map = new Map<string, FriendlyStatsEntry>();
  for (const raw of rows || []) {
    const row = raw as unknown as Omit<RankingStatsRow, "points">;
    const current = map.get(row.player_id) || { player: row.player, rounds: 0, games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, bestGoalkeeper: goalkeeperCounts.get(row.player_id) || 0 };
    current.rounds += 1;
    current.games += row.games;
    current.wins += row.wins;
    current.draws += row.draws;
    current.losses += row.losses;
    current.goals += row.goals;
    current.assists += row.assists;
    map.set(row.player_id, current);
  }
  return [...map.values()].sort((a, b) => a.player.name.localeCompare(b.player.name, "pt-BR"));
}
