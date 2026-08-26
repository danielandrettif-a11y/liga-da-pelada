"use server";

import { supabase } from "../supabase";
import { getActiveSeason, getActiveSeasonRoundIds } from "./seasons";
import { getAdminClient, getCurrentAccount } from "../auth";
import { DEFAULT_SCORING_POINTS } from "../scoring";
import { buildAwardSeasonsByPlayer, countAwards } from "../awards";
import type { EventType, SeasonStatus } from "../types";
import type { Player } from "../types";
import type { RankingEntry, RankingExperienceData } from "../ranking";
import { getAllPlayersEquippedCosmeticsMap } from "./cosmetics";

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

export type RoundStatisticEntry = {
  player: Player;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  points: number;
  winRate: number;
  isBestGoalkeeper: boolean;
};

export type RoundStatistics = {
  roundId: string;
  roundType: "official" | "friendly";
  entries: RoundStatisticEntry[];
  highlights: {
    scorers: RoundStatisticEntry[];
    assisters: RoundStatisticEntry[];
    topPoints: RoundStatisticEntry[];
    goalkeepers: RoundStatisticEntry[];
  };
};

function isSelectableAthlete(player: Player | null | undefined) {
  return Boolean(player?.is_selectable && (player.member_category === "player" || player.member_category === "guest"));
}

function sortRankingEntries<T extends Pick<RankingEntry, "points" | "wins" | "goals" | "assists">>(entries: T[]) {
  return [...entries].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goals !== a.goals) return b.goals - a.goals;
    return b.assists - a.assists;
  });
}

function aggregateRankingRows(
  rows: RankingStatsRow[],
  roundsMap?: Map<string, { id: string; number: number; date: string }>,
  maxBestRounds: number = 6,
) {
  const playerRowsMap = new Map<string, RankingStatsRow[]>();
  for (const row of rows) {
    const list = playerRowsMap.get(row.player_id) || [];
    list.push(row);
    playerRowsMap.set(row.player_id, list);
  }

  const entries: Omit<RankingEntry, "awards" | "awardSeasons" | "seasonPosition" | "positionChange">[] = [];

  for (const [, playerRows] of playerRowsMap.entries()) {
    if (!playerRows.length) continue;
    const first = playerRows[0];

    const sortedRows = [...playerRows].sort((a, b) => b.points - a.points);

    let totalRawPoints = 0;
    let games = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goals = 0;
    let assists = 0;

    const bestRounds = sortedRows.map((r, idx) => {
      totalRawPoints += r.points;
      games += r.games;
      wins += r.wins;
      draws += r.draws;
      losses += r.losses;
      goals += r.goals;
      assists += r.assists;

      const roundInfo = roundsMap?.get(r.round_id);
      return {
        roundId: r.round_id,
        roundNumber: roundInfo?.number ?? 0,
        date: roundInfo?.date ?? "",
        points: r.points,
        goals: r.goals,
        assists: r.assists,
        wins: r.wins,
        games: r.games,
        countedInTop6: idx < maxBestRounds,
      };
    });

    const top6Points = bestRounds
      .filter((r) => r.countedInTop6)
      .reduce((sum, r) => sum + r.points, 0);

    const minPointsToEnterTop6 = bestRounds.length >= maxBestRounds
      ? bestRounds[maxBestRounds - 1].points
      : null;

    const winRate = games === 0 ? 0 : Math.round(((wins * 3 + draws) / (games * 3)) * 100);

    entries.push({
      player: first.player,
      games,
      wins,
      draws,
      losses,
      goals,
      assists,
      points: top6Points,
      totalRawPoints,
      bestRounds,
      minPointsToEnterTop6,
      winRate,
    });
  }

  return sortRankingEntries(entries);
}

export async function calculateRoundStats(roundId: string) {
  try {
    const client = await getAdminClient();
    if (!client) return { success: false, error: "Somente administradores podem recalcular estatisticas." };

    // 1. Buscar a rodada e todas as partidas finalizadas com colunas explícitas
    const { data: round, error } = await client
      .from("rounds")
      .select(`
        id,
        league_id,
        round_type,
        best_goalkeeper_player_id,
        matches (
          id,
          status,
          team_a_id,
          team_b_id,
          score_a,
          score_b,
          match_events (
            id,
            event_type,
            player_id,
            assist_player_id,
            is_own_goal
          ),
          match_players (
            player_id,
            team_id,
            result_eligible
          ),
          match_goalkeepers (
            player_id,
            team_id
          )
        ),
        round_players (
          player_id
        )
      `)
      .eq("id", roundId)
      .single();

    if (error || !round) throw new Error("Erro ao buscar rodada para estatísticas");
    const countsForRanking = round.round_type !== "friendly";
    const roundPlayerIds = (round.round_players || []).map((item: any) => item.player_id);
    const { data: roundPlayerProfiles, error: profileError } = roundPlayerIds.length
      ? await client.from("players").select("id, player_profile").in("id", roundPlayerIds)
      : { data: [], error: null };
    if (profileError) throw new Error(`Erro ao buscar posições dos atletas: ${profileError.message}`);
    const profileByPlayerId = new Map((roundPlayerProfiles || []).map((player: any) => [player.id, player.player_profile]));

    const points = { ...DEFAULT_SCORING_POINTS };
    const { data: configuredRules, error: rulesError } = await client
      .from("ranking_rules")
      .select("event_type, points")
      .eq("league_id", round.league_id);

    if (rulesError) throw new Error(`Erro ao buscar regras de pontuação: ${rulesError.message}`);

    // Correções administrativas são persistentes e reaplicadas a cada consolidação.
    // Isso permite zerar apenas um jogador sem apagar gols/assistências dos demais.
    const { data: voidedRows, error: voidedError } = await client
      .from("player_round_stat_overrides")
      .select("player_id")
      .eq("round_id", roundId)
      .eq("override_type", "zero_points");
    if (voidedError && !/relation .* does not exist/i.test(voidedError.message)) {
      throw new Error(`Erro ao buscar correções de pontuação: ${voidedError.message}`);
    }
    const voidedPlayerIds = new Set((voidedRows || []).map((row: any) => row.player_id));

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
          goalkeeper_games: 0,
          clean_sheets: 0,
          goals_conceded: 0,
          defensive_clean_games: 0,
          defensive_one_goal_games: 0,
          own_goals: 0,
          team_goals_conceded: 0,
          points: 0,
        };
      }
    }

    // 3. Processar cada partida finalizada
    for (const match of finishedMatches) {
      const isDraw = match.score_a === match.score_b;
      const winnerId = isDraw ? null : (match.score_a > match.score_b ? match.team_a_id : match.team_b_id);

      const goalkeeperIds = new Set((match.match_goalkeepers || []).map((goalkeeper: any) => goalkeeper.player_id));
      // Resultado vale somente para participantes marcados como elegiveis.
      const processTeamMatch = (teamId: string, result: 'win' | 'draw' | 'loss') => {
        const teamGoalsConceded = teamId === match.team_a_id ? match.score_b : match.score_a;
        const participants = (match.match_players || []).filter(
          (participant: any) => participant.team_id === teamId && participant.result_eligible && !voidedPlayerIds.has(participant.player_id),
        );
        for (const participant of participants) {
          const s = statsMap[participant.player_id];
          if (!s) continue;
          s.games += 1;
          s.team_goals_conceded += teamGoalsConceded;
          // O defensor pontua pela proteção quando atuou na linha. Quem foi
          // escalado no gol naquele jogo usa exclusivamente os scouts de gol.
          if (profileByPlayerId.get(participant.player_id) === "defensive" && !goalkeeperIds.has(participant.player_id)) {
            if (teamGoalsConceded === 0) {
              s.defensive_clean_games += 1;
              if (countsForRanking) s.points += 2;
            } else if (teamGoalsConceded === 1) {
              s.defensive_one_goal_games += 1;
              if (countsForRanking) s.points += 1;
            }
          }
          if (result === 'win') { s.wins += 1; if (countsForRanking) s.points += points.win; }
          if (result === 'draw') { s.draws += 1; if (countsForRanking) s.points += points.draw; }
          if (result === 'loss') { s.losses += 1; if (countsForRanking) s.points += points.loss; }
        }
      };

      processTeamMatch(match.team_a_id, isDraw ? 'draw' : (winnerId === match.team_a_id ? 'win' : 'loss'));
      processTeamMatch(match.team_b_id, isDraw ? 'draw' : (winnerId === match.team_b_id ? 'win' : 'loss'));

      for (const goalkeeper of match.match_goalkeepers || []) {
        if (voidedPlayerIds.has(goalkeeper.player_id)) continue;
        const s = statsMap[goalkeeper.player_id];
        if (!s) continue;
        const conceded = goalkeeper.team_id === match.team_a_id ? match.score_b : match.score_a;
        s.goalkeeper_games += 1;
        s.goals_conceded += conceded;
        if (conceded === 0) s.clean_sheets += 1;
        if (countsForRanking) {
          s.points += points.goalkeeper_appearance;
          s.points += conceded * points.goal_conceded;
        }
      }

      // Processar eventos (gols e assistências)
      for (const ev of match.match_events) {
        if (ev.event_type === 'goal') {
          if (ev.is_own_goal) {
            const offender = statsMap[ev.player_id];
            if (offender && !voidedPlayerIds.has(ev.player_id)) {
              offender.own_goals += 1;
              if (countsForRanking) offender.points += points.own_goal;
            }
            continue;
          }
          // Gols
          const scorer = statsMap[ev.player_id];
          if (scorer && !voidedPlayerIds.has(ev.player_id)) {
            scorer.goals += 1;
            if (countsForRanking) scorer.points += points.goal;
          }
          // Assistências
          if (ev.assist_player_id) {
            const assister = statsMap[ev.assist_player_id];
            if (assister && !voidedPlayerIds.has(ev.assist_player_id)) {
              assister.assists += 1;
              if (countsForRanking) assister.points += points.assist;
            }
          }
        }
      }
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
  const season = await getActiveSeason();
  if (!season) return [];

  // 1. Tentar buscar direto da View SQL otimizada (PostgreSQL SUM + GROUP BY + ORDER BY)
  const { data: viewData, error: viewError } = await supabase
    .from("player_season_stats")
    .select(`
      player_id,
      player_name,
      player_nickname,
      player_avatar_url,
      player_profile,
      player_is_goalkeeper,
      player_member_category,
      player_is_selectable,
      games,
      wins,
      draws,
      losses,
      goals,
      assists,
      points,
      win_rate
    `)
    .eq("season_id", season.id)
    .eq("round_type", "official")
    .eq("player_is_selectable", true)
    .in("player_member_category", ["player", "guest"])
    .order("points", { ascending: false })
    .order("wins", { ascending: false })
    .order("goals", { ascending: false })
    .order("assists", { ascending: false });

  if (!viewError && viewData) {
    return viewData.map((row: any) => ({
      player: {
        id: row.player_id,
        name: row.player_name,
        nickname: row.player_nickname,
        avatar_url: row.player_avatar_url,
        player_profile: row.player_profile,
        is_goalkeeper: row.player_is_goalkeeper,
        member_category: row.player_member_category,
        is_selectable: row.player_is_selectable,
      } as Player,
      games: Number(row.games || 0),
      wins: Number(row.wins || 0),
      draws: Number(row.draws || 0),
      losses: Number(row.losses || 0),
      goals: Number(row.goals || 0),
      assists: Number(row.assists || 0),
      points: Number(row.points || 0),
      winRate: Number(row.win_rate || 0),
    }));
  }

  // Fallback seguro se a view ainda não estiver no banco
  const roundIds = await getActiveSeasonRoundIds(season.league_id, "official");
  if (roundIds.length === 0) return [];

  const { data, error } = await supabase
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
      player:player_id (
        id,
        name,
        nickname,
        avatar_url,
        player_profile,
        is_goalkeeper,
        member_category,
        is_selectable
      )
    `)
    .in("round_id", roundIds);

  if (error || !data) {
    if (error) console.error("Erro ao buscar ranking:", error);
    return [];
  }

  const map = new Map<string, any>();

  for (const row of data) {
    if (!isSelectableAthlete(row.player as unknown as Player | null)) continue;
    const pid = row.player_id;
    if (!map.has(pid)) {
      map.set(pid, {
        player: row.player as unknown as Player,
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
  ranking.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.goals - a.goals;
  });

  return ranking;
}

export async function getRoundStatistics(roundId: string): Promise<RoundStatistics | null> {
  const [{ data: round, error: roundError }, { data: rows, error: statsError }] = await Promise.all([
    supabase
      .from("rounds")
      .select("id, status, round_type")
      .eq("id", roundId)
      .maybeSingle(),
    supabase
      .from("player_round_stats")
      .select("games, wins, draws, losses, goals, assists, points, player:player_id(*)")
      .eq("round_id", roundId),
  ]);

  if (roundError || statsError || !round || round.status !== "finished") {
    if (roundError || statsError) console.error("Erro ao buscar estatísticas da rodada:", roundError || statsError);
    return null;
  }

  const entries = (rows || []).flatMap((raw: any) => {
    const player = Array.isArray(raw.player) ? raw.player[0] : raw.player;
    if (!player) return [];
    const games = Number(raw.games || 0);
    const wins = Number(raw.wins || 0);
    const draws = Number(raw.draws || 0);
    return [{
      player: player as Player,
      games,
      wins,
      draws,
      losses: Number(raw.losses || 0),
      goals: Number(raw.goals || 0),
      assists: Number(raw.assists || 0),
      points: Number(raw.points || 0),
      winRate: games > 0 ? Math.round(((wins * 3 + draws) / (games * 3)) * 100) : 0,
      isBestGoalkeeper: false,
    } satisfies RoundStatisticEntry];
  }).sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.points - a.points || a.player.name.localeCompare(b.player.name, "pt-BR"));

  const leaders = (key: "goals" | "assists" | "points", requirePositive = true) => {
    const maximum = Math.max(0, ...entries.map((entry) => entry[key]));
    if (requirePositive && maximum <= 0) return [];
    return entries.filter((entry) => entry[key] === maximum);
  };

  return {
    roundId,
    roundType: round.round_type === "friendly" ? "friendly" : "official",
    entries,
    highlights: {
      scorers: leaders("goals"),
      assisters: leaders("assists"),
      topPoints: round.round_type === "friendly" ? [] : leaders("points"),
      goalkeepers: [],
    },
  };
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
  // Convidados continuam com histórico e scouts nas partidas, mas o ranking
  // competitivo só começa quando o perfil é oficial. A união de perfis move os
  // scouts antigos para o perfil oficial e o recálculo passa a incluí-los.
  const currentStats = stats.filter(
    (row) => currentRoundIds.has(row.round_id) && row.player?.is_selectable && row.player.member_category === "player",
  );
  const latestRound = currentRounds[0];
  const roundsMap = new Map((rounds || []).map((round) => [round.id, { id: round.id, number: round.number, date: round.date }]));
  const generalBase = aggregateRankingRows(currentStats, roundsMap, 6);
  const previousBase = aggregateRankingRows(currentStats.filter((row) => row.round_id !== latestRound.id), roundsMap, 6);
  const latestBase = aggregateRankingRows(currentStats.filter((row) => row.round_id === latestRound.id), roundsMap, 6);
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

  const cosmeticsByPlayer = await getAllPlayersEquippedCosmeticsMap();

  const general = generalBase.map((entry, index): RankingEntry => {
    const previousPosition = previousPositions.get(entry.player.id);
    return {
      ...entry,
      awards: countAwards(getAwardSeasons(entry.player.id), "active"),
      awardSeasons: getAwardSeasons(entry.player.id),
      seasonPosition: index + 1,
      positionChange: previousPosition ? previousPosition - (index + 1) : null,
      fitness: getFitness(entry.player.id),
      cosmetics: cosmeticsByPlayer.get(entry.player.id) || null,
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
    cosmetics: cosmeticsByPlayer.get(entry.player.id) || null,
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
  const season = await getActiveSeason();
  if (!season) return [];

  // 1. Tentar buscar estatísticas de amistosos via VIEW SQL
  const [{ data: viewData, error: viewError }, { data: rounds, error: roundsError }] = await Promise.all([
    supabase
      .from("player_season_stats")
      .select(`
        player_id,
        player_name,
        player_nickname,
        player_avatar_url,
        player_profile,
        player_is_goalkeeper,
        player_member_category,
        player_is_selectable,
        rounds_count,
        games,
        wins,
        draws,
        losses,
        goals,
        assists
      `)
      .eq("season_id", season.id)
      .eq("round_type", "friendly")
      .eq("player_is_selectable", true)
      .in("player_member_category", ["player", "guest"]),
    supabase
      .from("rounds")
      .select("id, best_goalkeeper_player_id")
      .eq("season_id", season.id)
      .eq("round_type", "friendly")
      .eq("status", "finished"),
  ]);

  if (!viewError && viewData) {
    const goalkeeperCounts = new Map<string, number>();
    for (const round of rounds || []) {
      if (round.best_goalkeeper_player_id) {
        goalkeeperCounts.set(
          round.best_goalkeeper_player_id,
          (goalkeeperCounts.get(round.best_goalkeeper_player_id) || 0) + 1
        );
      }
    }

    return viewData
      .map((row: any) => ({
        player: {
          id: row.player_id,
          name: row.player_name,
          nickname: row.player_nickname,
          avatar_url: row.player_avatar_url,
          player_profile: row.player_profile,
          is_goalkeeper: row.player_is_goalkeeper,
          member_category: row.player_member_category,
          is_selectable: row.player_is_selectable,
        } as Player,
        rounds: Number(row.rounds_count || 0),
        games: Number(row.games || 0),
        wins: Number(row.wins || 0),
        draws: Number(row.draws || 0),
        losses: Number(row.losses || 0),
        goals: Number(row.goals || 0),
        assists: Number(row.assists || 0),
        bestGoalkeeper: goalkeeperCounts.get(row.player_id) || 0,
      }))
      .sort((a, b) => a.player.name.localeCompare(b.player.name, "pt-BR"));
  }

  // Fallback seguro
  const roundIds = await getActiveSeasonRoundIds(season.league_id, "friendly");
  if (roundIds.length === 0) return [];
  const [{ data: rows, error }, { data: fallbackRounds, error: fbRoundsError }] = await Promise.all([
    supabase
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
        player:player_id (
          id,
          name,
          nickname,
          avatar_url,
          player_profile,
          is_goalkeeper,
          member_category,
          is_selectable
        )
      `)
      .in("round_id", roundIds),
    supabase.from("rounds").select("id, best_goalkeeper_player_id").in("id", roundIds).eq("status", "finished"),
  ]);

  if (error || fbRoundsError) {
    console.error("Erro ao buscar estatisticas de amistosos:", error || fbRoundsError);
    return [];
  }
  const goalkeeperCounts = new Map<string, number>();
  for (const round of fallbackRounds || []) {
    if (round.best_goalkeeper_player_id) {
      goalkeeperCounts.set(round.best_goalkeeper_player_id, (goalkeeperCounts.get(round.best_goalkeeper_player_id) || 0) + 1);
    }
  }
  const map = new Map<string, FriendlyStatsEntry>();
  for (const raw of rows || []) {
    const row = raw as unknown as Omit<RankingStatsRow, "points">;
    if (!isSelectableAthlete(row.player)) continue;
    const current = map.get(row.player_id) || {
      player: row.player,
      rounds: 0,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      assists: 0,
      bestGoalkeeper: goalkeeperCounts.get(row.player_id) || 0,
    };
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
