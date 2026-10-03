"use server";

import { unstable_cache } from "next/cache";
import { supabase } from "../supabase";
import { getActiveSeason, getActiveSeasonRoundIds } from "./seasons";
import { getAdminClient, getCurrentAccount } from "../auth";
import { buildRankedPointBreakdown, calculateRankedPoints } from "../ranked-scoring";
import { buildAwardSeasonsByPlayer, countAwards } from "../awards";
import type { SeasonStatus } from "../types";
import type { Player } from "../types";
import { rankingActivePlayerIds, roundRankingPoints, sortRankingRounds, type OverallTrend, type RankingEntry, type RankingExperienceData } from "../ranking";
import { getAllPlayersEquippedCosmeticsMap } from "./cosmetics";
import { normalizeBQScoringSnapshot } from "../bq-scoring";
import { isCompetitiveProfileComplete } from "../player-eligibility";
import {
  calculateRankingPositionBonus,
  parseRankingRoleWeights,
  rankingRoleWeightsLabel,
  resolveRankingRoleWeights,
  type RankingRoleWeight,
} from "../ranking-position-bonus";

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
  goalkeeper_games: number;
  goals_conceded: number;
  clean_sheets: number;
  own_goals: number;
  defensive_clean_games: number;
  defensive_one_goal_games: number;
  team_goals_conceded: number;
  ranking_defensive_clean_games: number;
  ranking_defensive_one_goal_games: number;
  ranking_role_weights: unknown;
  ranking_position_bonus: number;
  ranking_points: number;
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

export type PlayerCardOverall = {
  overall: number;
  trend: OverallTrend;
  positions: { DEF: number; ALA_MEI: number; ATA: number; GOL: number } | null;
  positionTrends: Record<"DEF" | "ALA_MEI" | "ATA" | "GOL", OverallTrend>;
  goalkeeperGames: number;
  goalkeeperRounds: number;
};

function overallTrend(value: unknown): OverallTrend {
  return value === "rising" || value === "falling" ? value : "steady";
}

export async function getLatestPlayerCardOverallMap(client: any = supabase) {
  const { data, error } = await client.rpc("get_latest_player_card_overalls");
  if (error) {
    console.error("Erro ao buscar OVR para as cartas:", error);
    return new Map<string, PlayerCardOverall>();
  }

  return new Map<string, PlayerCardOverall>((data || []).flatMap((row: any) => {
    const overall = Number(row.overall);
    const trend = overallTrend(row.trend);
    const values = {
      DEF: Number(row.def_overall),
      ALA_MEI: Number(row.ala_mei_overall),
      ATA: Number(row.ata_overall),
      GOL: Number(row.gol_overall),
    };
    const positions = Object.values(values).every(Number.isFinite) ? values : null;
    const positionTrends = {
      DEF: overallTrend(row.def_trend),
      ALA_MEI: overallTrend(row.ala_mei_trend),
      ATA: overallTrend(row.ata_trend),
      GOL: overallTrend(row.gol_trend),
    };
    return row.player_id && Number.isFinite(overall) ? [[row.player_id, { overall, trend, positions, positionTrends, goalkeeperGames: Number(row.goalkeeper_games || 0), goalkeeperRounds: Number(row.goalkeeper_rounds || 0) }] as const] : [];
  }));
}

async function getPublicSpeedRatingMap(client: any = supabase) {
  const { data, error } = await client.rpc("get_public_player_speed_ratings");
  if (error) {
    console.error("Erro ao buscar estrelas de velocidade para as cartas:", error);
    return new Map<string, 1 | 2 | 3>();
  }
  return new Map<string, 1 | 2 | 3>((data || []).flatMap((row: any) => (
    row.player_id && [1, 2, 3].includes(Number(row.speed_rating))
      ? [[row.player_id, Number(row.speed_rating) as 1 | 2 | 3] as const]
      : []
  )));
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
    // A rodada guarda uma linha zerada para todos os convocados, inclusive
    // quem acabou não entrando em campo. Essa linha é útil na consolidação,
    // mas não é uma partida e jamais deve aparecer entre as melhores atuações.
    if (Number(row.games || 0) <= 0) continue;
    const list = playerRowsMap.get(row.player_id) || [];
    list.push(row);
    playerRowsMap.set(row.player_id, list);
  }

  const entries: Omit<RankingEntry, "awards" | "awardSeasons" | "seasonPosition" | "positionChange">[] = [];

  for (const [, playerRows] of playerRowsMap.entries()) {
    if (!playerRows.length) continue;
    const first = playerRows[0];

    const officialRows = sortRankingRounds(playerRows, (row) => roundRankingPoints(Number(row.ranking_points ?? row.points)));
    const legacyRows = sortRankingRounds(playerRows, (row) => row.points);

    let totalRawPoints = 0;
    let games = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goals = 0;
    let assists = 0;
    let goalkeeperGames = 0;
    let goalsConceded = 0;
    let cleanSheets = 0;

    for (const r of playerRows) {
      totalRawPoints += r.points;
      games += r.games;
      wins += r.wins;
      draws += r.draws;
      losses += r.losses;
      goals += r.goals;
      assists += r.assists;
      goalkeeperGames += r.goalkeeper_games;
      goalsConceded += r.goals_conceded;
      cleanSheets += r.clean_sheets;
    }

    const mapRound = (r: RankingStatsRow, countedInTop6: boolean, legacy = false) => {
      const roundInfo = roundsMap?.get(r.round_id);
      const pointBreakdown = buildRankedPointBreakdown({
        goals: r.goals,
        assists: r.assists,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        goalkeeperAppearances: r.goalkeeper_games,
        goalkeeperGoalsConceded: r.goals_conceded,
        ownGoals: r.own_goals,
      });
      const explainedPoints = roundRankingPoints(pointBreakdown.reduce((sum, item) => sum + item.points, 0));
      if (explainedPoints !== roundRankingPoints(r.points)) {
        pointBreakdown.push({ label: "Ajuste da rodada", count: 1, points: roundRankingPoints(r.points - explainedPoints) });
      }
      const roleWeights = parseRankingRoleWeights(r.ranking_role_weights);
      const positionBonus = roundRankingPoints(Number(r.ranking_position_bonus || 0));
      if (!legacy && positionBonus !== 0) {
        pointBreakdown.push({
          label: `Bônus posicional · ${rankingRoleWeightsLabel(roleWeights)}`,
          count: 1,
          points: positionBonus,
        });
      }
      return {
        roundId: r.round_id,
        roundNumber: roundInfo?.number ?? 0,
        date: roundInfo?.date ?? "",
        points: roundRankingPoints(legacy ? r.points : Number(r.ranking_points ?? r.points)),
        legacyPoints: roundRankingPoints(r.points),
        positionBonus,
        roleWeights,
        goals: r.goals,
        assists: r.assists,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        games: r.games,
        pointBreakdown,
        countedInTop6,
      };
    };

    const bestRounds = officialRows.map((row, index) => mapRound(row, index < maxBestRounds));
    const legacyBestRounds = legacyRows.map((row, index) => mapRound(row, index < maxBestRounds, true));

    const top6Points = roundRankingPoints(bestRounds
      .filter((r) => r.countedInTop6)
      .reduce((sum, r) => sum + r.points, 0));

    const minPointsToEnterTop6 = bestRounds.length >= maxBestRounds
      ? bestRounds[maxBestRounds - 1].points
      : null;
    const legacyMinPointsToEnterTop6 = legacyBestRounds.length >= maxBestRounds
      ? legacyBestRounds[maxBestRounds - 1].points
      : null;
    const legacyPoints = roundRankingPoints(legacyBestRounds
      .filter((r) => r.countedInTop6)
      .reduce((sum, r) => sum + r.points, 0));
    const positionBonus = roundRankingPoints(bestRounds
      .filter((r) => r.countedInTop6)
      .reduce((sum, r) => sum + r.positionBonus, 0));

    const winRate = games === 0 ? 0 : Math.round(((wins * 3 + draws) / (games * 3)) * 100);

    entries.push({
      player: first.player,
      games,
      wins,
      draws,
      losses,
      goals,
      assists,
      goalkeeperStats: goalkeeperGames > 0 ? { games: goalkeeperGames, goalsConceded, cleanSheets } : null,
      points: top6Points,
      legacyPoints,
      positionBonus,
      totalRawPoints: roundRankingPoints(totalRawPoints),
      bestRounds,
      legacyBestRounds,
      minPointsToEnterTop6,
      legacyMinPointsToEnterTop6,
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
        date,
        created_at,
        round_type,
        suppress_goalkeeper_rewards,
        scoring_version,
        scoring_snapshot,
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
            result_eligible,
            scoring_eligible
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
    const suppressGoalkeeperRewards = Boolean(round.suppress_goalkeeper_rewards);
    const scoringSnapshot = normalizeBQScoringSnapshot(round.scoring_snapshot as Record<string, unknown> | null);
    const roundPlayerIds = (round.round_players || []).map((item: any) => item.player_id);
    const { data: roundPlayerProfiles, error: profileError } = roundPlayerIds.length
      ? await client.from("players").select("id, player_profile, overall_traits, member_category, is_selectable, is_competitive_profile_complete").in("id", roundPlayerIds)
      : { data: [], error: null };
    if (profileError) throw new Error(`Erro ao buscar posições dos atletas: ${profileError.message}`);
    const profileByPlayerId = new Map((roundPlayerProfiles || []).map((player: any) => [player.id, player.player_profile]));
    const playerById = new Map((roundPlayerProfiles || []).map((player: any) => [player.id, player]));
    const [{ data: frozenRankingRows, error: frozenRankingError }, { data: playedRankingRows, error: playedRankingError }, overallByPlayer] = await Promise.all([
      roundPlayerIds.length
        ? client.from("player_round_stats").select("player_id, ranking_role_weights").eq("round_id", roundId).in("player_id", roundPlayerIds)
        : Promise.resolve({ data: [], error: null }),
      roundPlayerIds.length
        ? client.from("player_round_stats")
          .select("player_id, games, round:round_id(id, date, created_at, round_type, status)")
          .eq("league_id", round.league_id).in("player_id", roundPlayerIds).gt("games", 0)
        : Promise.resolve({ data: [], error: null }),
      getLatestPlayerCardOverallMap(client),
    ]);
    if (frozenRankingError) throw new Error(`Erro ao buscar posições congeladas do ranking: ${frozenRankingError.message}`);
    if (playedRankingError) throw new Error(`Erro ao buscar histórico do ranking: ${playedRankingError.message}`);
    const frozenRankingWeights = new Map((frozenRankingRows || []).map((row: any) => [row.player_id, parseRankingRoleWeights(row.ranking_role_weights)]));
    const currentRoundOrder = `${round.date}|${round.created_at}|${round.id}`;
    const playersWithPriorOfficialRound = new Set((playedRankingRows || []).flatMap((row: any) => {
      const previousRound = Array.isArray(row.round) ? row.round[0] : row.round;
      if (!previousRound || previousRound.id === roundId || previousRound.round_type !== "official" || previousRound.status !== "finished") return [];
      return `${previousRound.date}|${previousRound.created_at}|${previousRound.id}` < currentRoundOrder ? [row.player_id] : [];
    }));

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
          goalkeeper_goals: 0,
          goalkeeper_assists: 0,
          goalkeeper_own_goals: 0,
          goalkeeper_wins: 0,
          goalkeeper_draws: 0,
          goalkeeper_losses: 0,
          clean_sheets: 0,
          goals_conceded: 0,
          defensive_clean_games: 0,
          defensive_one_goal_games: 0,
          ranking_defensive_clean_games: 0,
          ranking_defensive_one_goal_games: 0,
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
      const scoringEligiblePlayerIds = new Set(
        (match.match_players || [])
          .filter((participant: any) => participant.scoring_eligible !== false)
          .map((participant: any) => participant.player_id),
      );
      // Resultado vale somente para participantes marcados como elegiveis.
      const processTeamMatch = (teamId: string, result: 'win' | 'draw' | 'loss') => {
        const teamGoalsConceded = teamId === match.team_a_id ? match.score_b : match.score_a;
        const participants = (match.match_players || []).filter(
          (participant: any) => participant.team_id === teamId
            && participant.result_eligible
            && participant.scoring_eligible !== false
            && !voidedPlayerIds.has(participant.player_id),
        );
        for (const participant of participants) {
          const s = statsMap[participant.player_id];
          if (!s) continue;
          s.games += 1;
          s.team_goals_conceded += teamGoalsConceded;
          // Mantém os scouts defensivos brutos exclusivamente para o motor do
          // Cartola. Eles não entram no cálculo da Ranked.
          const profile = profileByPlayerId.get(participant.player_id);
          // Na V7 o scout bruto é guardado para todo jogador de linha. Quem
          // pode convertê-lo em bônus continua sendo decidido pela posição
          // travada na escalação, não pela tag que o perfil tiver depois.
          const receivesLineDefenseScout = profile === "defensive"
            || Number(round.scoring_version || 5) >= 7;
          if (!goalkeeperIds.has(participant.player_id)) {
            if (teamGoalsConceded === 0) {
              s.ranking_defensive_clean_games += 1;
            } else if (teamGoalsConceded === 1) {
              s.ranking_defensive_one_goal_games += 1;
            }
          }
          if (receivesLineDefenseScout && !goalkeeperIds.has(participant.player_id)) {
            if (teamGoalsConceded === 0) {
              s.defensive_clean_games += 1;
            } else if (teamGoalsConceded === 1) {
              s.defensive_one_goal_games += 1;
            }
          }
          if (result === 'win') s.wins += 1;
          if (result === 'draw') s.draws += 1;
          if (result === 'loss') s.losses += 1;
        }
      };

      processTeamMatch(match.team_a_id, isDraw ? 'draw' : (winnerId === match.team_a_id ? 'win' : 'loss'));
      processTeamMatch(match.team_b_id, isDraw ? 'draw' : (winnerId === match.team_b_id ? 'win' : 'loss'));

      for (const goalkeeper of match.match_goalkeepers || []) {
        if (voidedPlayerIds.has(goalkeeper.player_id) || !scoringEligiblePlayerIds.has(goalkeeper.player_id)) continue;
        const s = statsMap[goalkeeper.player_id];
        if (!s) continue;
        const conceded = goalkeeper.team_id === match.team_a_id ? match.score_b : match.score_a;
        s.goalkeeper_games += 1;
        s.goals_conceded += conceded;
        if (conceded === 0) s.clean_sheets += 1;
        if (isDraw) s.goalkeeper_draws += 1;
        else if (winnerId === goalkeeper.team_id) s.goalkeeper_wins += 1;
        else s.goalkeeper_losses += 1;
      }

      // Processar eventos (gols e assistências)
      for (const ev of match.match_events) {
        if (ev.event_type === 'goal') {
          if (ev.is_own_goal) {
            const offender = statsMap[ev.player_id];
            if (offender && scoringEligiblePlayerIds.has(ev.player_id) && !voidedPlayerIds.has(ev.player_id)) {
              offender.own_goals += 1;
              if (goalkeeperIds.has(ev.player_id)) offender.goalkeeper_own_goals += 1;
            }
            continue;
          }
          // Gols
          const scorer = statsMap[ev.player_id];
          if (scorer && scoringEligiblePlayerIds.has(ev.player_id) && !voidedPlayerIds.has(ev.player_id)) {
            scorer.goals += 1;
            if (goalkeeperIds.has(ev.player_id)) scorer.goalkeeper_goals += 1;
          }
          // Assistências
          if (ev.assist_player_id) {
            const assister = statsMap[ev.assist_player_id];
            if (assister && scoringEligiblePlayerIds.has(ev.assist_player_id) && !voidedPlayerIds.has(ev.assist_player_id)) {
              assister.assists += 1;
              if (goalkeeperIds.has(ev.assist_player_id)) assister.goalkeeper_assists += 1;
            }
          }
        }
      }
    }

    // 4. Salvar tudo (Upsert)
    const statsArray = Object.values(statsMap).map((stats: any) => {
      const frozen = frozenRankingWeights.get(stats.player_id) || [];
      const overallPositions = overallByPlayer.get(stats.player_id)?.positions;
      const player = playerById.get(stats.player_id);
      const primaryTrait = Array.isArray(player?.overall_traits) ? player.overall_traits[0] : null;
      const fallbackRole = primaryTrait === "defensive" ? "DEF" : primaryTrait === "midfield" ? "MEI" : "ATA";
      const roleWeights: RankingRoleWeight[] = !countsForRanking || stats.games <= 0 || !player?.is_competitive_profile_complete
        ? []
        : frozen.length
          ? frozen
          : overallPositions
            ? resolveRankingRoleWeights(
              { DEF: overallPositions.DEF, ALA_MEI: overallPositions.ALA_MEI, ATA: overallPositions.ATA },
              primaryTrait,
              !playersWithPriorOfficialRound.has(stats.player_id),
            )
            : [{ role: fallbackRole, overall: 0, weight: 1 }];
      const rankingPositionBonus = calculateRankingPositionBonus({
        roleWeights,
        goals: stats.goals,
        assists: stats.assists,
        draws: stats.draws,
        defensiveCleanGames: stats.ranking_defensive_clean_games,
        defensiveOneGoalGames: stats.ranking_defensive_one_goal_games,
        goalkeeperGames: stats.goalkeeper_games,
        cleanSheets: stats.clean_sheets,
        suppressGoalkeeperRewards,
      });
      return {
        ...stats,
        ranking_role_weights: roleWeights,
        ranking_position_bonus: rankingPositionBonus,
        points: countsForRanking ? calculateRankedPoints({
        wins: stats.wins,
        goals: stats.goals,
        assists: stats.assists,
        draws: stats.draws,
        losses: stats.losses,
        ownGoals: stats.own_goals,
        goalkeeperAppearances: suppressGoalkeeperRewards ? 0 : stats.goalkeeper_games,
        goalkeeperGoalsConceded: stats.goals_conceded,
        }, scoringSnapshot) : 0,
      };
    });
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

async function getRankingUncached() {
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
      ranking_points,
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
      points: roundRankingPoints(Number(row.ranking_points ?? row.points ?? 0)),
      legacyPoints: roundRankingPoints(Number(row.points || 0)),
      positionBonus: roundRankingPoints(Number(row.ranking_points ?? row.points ?? 0) - Number(row.points || 0)),
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
      ranking_points,
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
        legacyPoints: 0,
        positionBonus: 0,
      });
    }

    const s = map.get(pid);
    s.games += row.games;
    s.wins += row.wins;
    s.draws += row.draws;
    s.losses += row.losses;
    s.goals += row.goals;
    s.assists += row.assists;
    s.points += Number(row.ranking_points ?? row.points ?? 0);
    s.legacyPoints += Number(row.points || 0);
    s.positionBonus += Number(row.ranking_points ?? row.points ?? 0) - Number(row.points || 0);
  }

  const ranking = Array.from(map.values()).map((entry) => ({
    ...entry,
    points: roundRankingPoints(entry.points),
    legacyPoints: roundRankingPoints(entry.legacyPoints),
    positionBonus: roundRankingPoints(entry.positionBonus),
  }));
  ranking.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.goals - a.goals;
  });

  return ranking;
}

const getRankingCached = unstable_cache(getRankingUncached, ["official-ranking"], {
  revalidate: 60,
  tags: ["ranking"],
});

export async function getRanking() {
  return getRankingCached();
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
      .select("games, wins, draws, losses, goals, assists, points, ranking_points, player:player_id(*)")
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
    // Convocados que não participaram recebem uma linha 0 no fechamento da
    // rodada. Ela não representa presença, portanto não vai para o histórico.
    if (games <= 0) return [];
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
      points: Number(raw.ranking_points ?? raw.points ?? 0),
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
    monthly: null,
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
      goalkeeper_games,
      goals_conceded,
      clean_sheets,
      own_goals,
      defensive_clean_games,
      defensive_one_goal_games,
      team_goals_conceded,
      ranking_defensive_clean_games,
      ranking_defensive_one_goal_games,
      ranking_role_weights,
      ranking_position_bonus,
      ranking_points,
      player:player_id (*)
    `)
    .in("round_id", (rounds || []).map((round) => round.id));

  if (statsError || !rawStats) {
    if (statsError) console.error("Erro ao buscar dados detalhados do ranking:", statsError);
    return { ...emptyData, seasonLabel };
  }

  const stats = (rawStats as any[]).map((row) => ({
    ...row,
    player: Array.isArray(row.player) ? row.player[0] || null : row.player,
  })) as RankingStatsRow[];
  const currentRoundIds = new Set(currentRounds.map((round) => round.id));
  // O histórico permanece intacto. A classificação pública exige cadastro
  // competitivo completo e ao menos uma atuação nas três peladas mais recentes.
  const eligibleCurrentStats = stats.filter(
    (row) => currentRoundIds.has(row.round_id) && isCompetitiveProfileComplete(row.player),
  );
  const latestRound = currentRounds[0];
  const roundsMap = new Map((rounds || []).map((round) => [round.id, { id: round.id, number: round.number, date: round.date }]));
  const activePlayerIds = rankingActivePlayerIds(currentRounds.slice(0, 3).map((round) => round.id), eligibleCurrentStats);
  const previousActivePlayerIds = rankingActivePlayerIds(currentRounds.slice(1, 4).map((round) => round.id), eligibleCurrentStats);
  const currentStats = eligibleCurrentStats.filter((row) => activePlayerIds.has(row.player_id));
  const generalBase = aggregateRankingRows(currentStats, roundsMap, 6);
  const previousBase = aggregateRankingRows(
    eligibleCurrentStats.filter((row) => row.round_id !== latestRound.id && previousActivePlayerIds.has(row.player_id)),
    roundsMap,
    6,
  );
  const latestBase = aggregateRankingRows(currentStats.filter((row) => row.round_id === latestRound.id), roundsMap, 6);
  // A lista vem ordenada por data decrescente. Portanto, o primeiro mês é o
  // mês atual quando há jogo nele ou, caso contrário, o último mês com dados.
  const monthlyKey = String(latestRound.date).slice(0, 7);
  const monthlyRoundIds = new Set(currentRounds
    .filter((round) => String(round.date).slice(0, 7) === monthlyKey)
    .map((round) => round.id));
  // No mês entram todas as rodadas (normalmente quatro ou cinco), sem o corte
  // das seis melhores usado apenas na classificação da temporada.
  const monthlyBase = aggregateRankingRows(
    currentStats.filter((row) => monthlyRoundIds.has(row.round_id)),
    roundsMap,
    Number.MAX_SAFE_INTEGER,
  );
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
  const [{ data: fitnessRows }, cosmeticsByPlayer, overallByPlayer, speedByPlayer] = await Promise.all([
    fitnessClient
      .from("player_round_fitness")
      .select("player_id, distance_km, average_speed_kmh")
      .in("round_id", currentRounds.map((round) => round.id)),
    getAllPlayersEquippedCosmeticsMap(),
    getLatestPlayerCardOverallMap(fitnessClient),
    getPublicSpeedRatingMap(fitnessClient),
  ]);
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

  function getMonthlyAwardSeasons(playerId: string) {
    return getAwardSeasons(playerId).map((awardSeason) => ({
      ...awardSeason,
      awards: awardSeason.awards.filter((award) => String(award.roundDate).slice(0, 7) === monthlyKey),
    }));
  }

  const general = generalBase.map((entry, index): RankingEntry => {
    const previousPosition = previousPositions.get(entry.player.id);
    return {
      ...entry,
      awards: countAwards(getAwardSeasons(entry.player.id), "active"),
      awardSeasons: getAwardSeasons(entry.player.id),
      seasonPosition: index + 1,
      positionChange: previousPosition ? previousPosition - (index + 1) : null,
      overall: overallByPlayer.get(entry.player.id)?.overall ?? null,
      overallTrend: overallByPlayer.get(entry.player.id)?.trend ?? null,
      overallPositions: overallByPlayer.get(entry.player.id)?.positions ?? null,
      overallPositionTrends: overallByPlayer.get(entry.player.id)?.positionTrends ?? null,
      overallGoalkeeperGames: overallByPlayer.get(entry.player.id)?.goalkeeperGames ?? 0,
      overallGoalkeeperRounds: overallByPlayer.get(entry.player.id)?.goalkeeperRounds ?? 0,
      speedRating: speedByPlayer.get(entry.player.id) ?? null,
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
    overall: overallByPlayer.get(entry.player.id)?.overall ?? null,
    overallTrend: overallByPlayer.get(entry.player.id)?.trend ?? null,
    overallPositions: overallByPlayer.get(entry.player.id)?.positions ?? null,
    overallPositionTrends: overallByPlayer.get(entry.player.id)?.positionTrends ?? null,
    overallGoalkeeperGames: overallByPlayer.get(entry.player.id)?.goalkeeperGames ?? 0,
    overallGoalkeeperRounds: overallByPlayer.get(entry.player.id)?.goalkeeperRounds ?? 0,
    speedRating: speedByPlayer.get(entry.player.id) ?? null,
    fitness: getFitness(entry.player.id),
    cosmetics: cosmeticsByPlayer.get(entry.player.id) || null,
  }));

  const monthlyEntries = monthlyBase.map((entry): RankingEntry => ({
    ...entry,
    awards: countAwards(getMonthlyAwardSeasons(entry.player.id), "active"),
    awardSeasons: getMonthlyAwardSeasons(entry.player.id),
    seasonPosition: seasonPositions.get(entry.player.id) || general.length + 1,
    positionChange: null,
    overall: overallByPlayer.get(entry.player.id)?.overall ?? null,
    overallTrend: overallByPlayer.get(entry.player.id)?.trend ?? null,
    overallPositions: overallByPlayer.get(entry.player.id)?.positions ?? null,
    overallPositionTrends: overallByPlayer.get(entry.player.id)?.positionTrends ?? null,
    overallGoalkeeperGames: overallByPlayer.get(entry.player.id)?.goalkeeperGames ?? 0,
    overallGoalkeeperRounds: overallByPlayer.get(entry.player.id)?.goalkeeperRounds ?? 0,
    speedRating: speedByPlayer.get(entry.player.id) ?? null,
    fitness: getFitness(entry.player.id),
    cosmetics: cosmeticsByPlayer.get(entry.player.id) || null,
  }));
  const [monthlyYear, monthlyMonth] = monthlyKey.split("-").map(Number);
  const monthlyLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(Date.UTC(monthlyYear, monthlyMonth - 1, 15)));

  return {
    seasonLabel,
    general,
    monthly: {
      key: monthlyKey,
      label: monthlyLabel.charAt(0).toUpperCase() + monthlyLabel.slice(1),
      entries: monthlyEntries,
    },
    latestRound: {
      id: latestRound.id,
      number: latestRound.number,
      date: latestRound.date,
      entries: latestEntries,
    },
  };
}

export async function getPlayerRankingEntry(playerId: string): Promise<{ entry: RankingEntry; position: number } | null> {
  const data = await getRankingExperienceData();
  const index = data.general.findIndex((item) => item.player.id === playerId);
  if (index >= 0) {
    return {
      entry: data.general[index],
      position: index + 1,
    };
  }

  const { data: player } = await supabase.from("players").select("*").eq("id", playerId).maybeSingle();
  if (!player) return null;

  const [{ data: cosmeticsData }, overallByPlayer, speedByPlayer] = await Promise.all([
    supabase
      .from("player_equipped_cosmetics")
      .select("slot, cosmetic:cosmetic_id(name, asset_key, slot)")
      .eq("player_id", playerId),
    getLatestPlayerCardOverallMap(supabase),
    getPublicSpeedRatingMap(supabase),
  ]);

  const cosmeticsMap = new Map((cosmeticsData || []).map((item: any) => [item.slot, item.cosmetic]));
  const frame = cosmeticsMap.get("frame");
  const aura = cosmeticsMap.get("aura");
  const title = cosmeticsMap.get("title");
  const banner = cosmeticsMap.get("banner");
  const nameplate = cosmeticsMap.get("nameplate");

  const entry: RankingEntry = {
    player: player as unknown as Player,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals: 0,
    assists: 0,
    points: 0,
    legacyPoints: 0,
    positionBonus: 0,
    overall: overallByPlayer.get(playerId)?.overall ?? null,
    overallTrend: overallByPlayer.get(playerId)?.trend ?? null,
    overallPositions: overallByPlayer.get(playerId)?.positions ?? null,
    overallPositionTrends: overallByPlayer.get(playerId)?.positionTrends ?? null,
    overallGoalkeeperGames: overallByPlayer.get(playerId)?.goalkeeperGames ?? 0,
    overallGoalkeeperRounds: overallByPlayer.get(playerId)?.goalkeeperRounds ?? 0,
    speedRating: speedByPlayer.get(playerId) ?? null,
    winRate: 0,
    awards: { roundMvp: 0, topScorer: 0, topAssister: 0, kingOfWins: 0 },
    awardSeasons: [],
    seasonPosition: data.general.length + 1,
    positionChange: null,
    fitness: null,
    cosmetics: {
      frameKey: frame?.asset_key || null,
      auraKey: aura?.asset_key || null,
      titleName: title?.name || null,
      bannerAssetKey: banner?.asset_key || null,
      nameplateKey: nameplate?.asset_key || null,
    },
  };

  return {
    entry,
    position: data.general.length + 1,
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
