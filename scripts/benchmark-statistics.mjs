import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs.readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, "")];
      }),
  );
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function summarize(samples) {
  return {
    samples: samples.length,
    p50Ms: Math.round(percentile(samples, 0.5) * 100) / 100,
    p95Ms: Math.round(percentile(samples, 0.95) * 100) / 100,
    maxMs: Math.round(Math.max(...samples) * 100) / 100,
  };
}

async function measure(label, iterations, operation) {
  const samples = [];
  let rowCount = 0;
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    const result = await operation();
    samples.push(performance.now() - startedAt);
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
    rowCount = result.data?.length || 0;
  }
  return { ...summarize(samples), rowCount };
}

function numeric(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function aggregateRoundRows(rows) {
  const totals = new Map();
  for (const row of rows) {
    const current = totals.get(row.player_id) || {
      rounds_count: new Set(), games: 0, goals: 0, assists: 0,
      wins: 0, draws: 0, losses: 0, points: 0, ranking_points: 0,
    };
    current.rounds_count.add(row.round_id);
    for (const field of ["games", "goals", "assists", "wins", "draws", "losses", "points", "ranking_points"]) {
      current[field] += numeric(row[field] ?? (field === "ranking_points" ? row.points : 0));
    }
    totals.set(row.player_id, current);
  }
  return totals;
}

const env = { ...loadEnv(".env.local"), ...process.env };
const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!env.NEXT_PUBLIC_SUPABASE_URL || !secretKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios.");
}

const iterationsValue = Number(env.STATS_BENCHMARK_ITERATIONS || 20);
const iterations = Number.isInteger(iterationsValue) && iterationsValue >= 5 && iterationsValue <= 100
  ? iterationsValue
  : 20;
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: seasons, error: seasonsError } = await supabase
  .from("seasons")
  .select("id, league_id, number, status, started_at")
  .order("started_at", { ascending: false });
if (seasonsError) throw new Error(`Temporadas: ${seasonsError.message}`);

const candidates = [];
for (const season of seasons || []) {
  const { data: rounds, error } = await supabase
    .from("rounds")
    .select("id, league_id")
    .eq("season_id", season.id)
    .eq("round_type", "official")
    .eq("status", "finished");
  if (error) throw new Error(`Rodadas: ${error.message}`);
  candidates.push({ season, rounds: rounds || [] });
}
const target = candidates.sort((a, b) => b.rounds.length - a.rounds.length)[0];
if (!target || target.rounds.length === 0) throw new Error("Nenhuma temporada com rodada oficial finalizada foi encontrada.");

const roundIds = target.rounds.map((round) => round.id);
const wrongLeagueRounds = target.rounds.filter((round) => round.league_id !== target.season.league_id).length;
const seasonViewQuery = () => supabase
  .from("player_season_stats")
  .select("player_id, rounds_count, games, goals, assists, wins, draws, losses, points, ranking_points")
  .eq("season_id", target.season.id)
  .eq("round_type", "official");
const rankingHistoryQuery = () => supabase
  .from("player_round_stats")
  .select("player_id, round_id, league_id, games, goals, assists, wins, draws, losses, points, ranking_points")
  .in("round_id", roundIds);

const [seasonViewMetric, rankingHistoryMetric, viewResult, historyResult] = await Promise.all([
  measure("season_view", iterations, seasonViewQuery),
  measure("ranking_history", iterations, rankingHistoryQuery),
  seasonViewQuery(),
  rankingHistoryQuery(),
]);
if (viewResult.error) throw new Error(`View: ${viewResult.error.message}`);
if (historyResult.error) throw new Error(`Histórico: ${historyResult.error.message}`);

const rawRows = historyResult.data || [];
const playerId = rawRows.find((row) => numeric(row.games) > 0)?.player_id || rawRows[0]?.player_id;
const playerHistoryMetric = playerId
  ? await measure("player_history", iterations, () => supabase
      .from("player_round_stats")
      .select("id, player_id, round_id, games, wins, draws, losses, goals, assists, points, ranking_points, ranking_position_bonus, goalkeeper_games, goalkeeper_goals, goalkeeper_assists, goalkeeper_own_goals, goals_conceded, clean_sheets, own_goals, defensive_clean_games, defensive_one_goal_games, team_goals_conceded, ranking_defensive_clean_games, ranking_defensive_one_goal_games, player_profile_locked, rounds(number,date,scoring_snapshot)")
      .eq("player_id", playerId)
      .in("round_id", roundIds)
      .order("rounds(number)", { ascending: false }))
  : null;

const rawTotals = aggregateRoundRows(rawRows);
let parityMismatches = 0;
for (const row of viewResult.data || []) {
  const expected = rawTotals.get(row.player_id);
  if (!expected) {
    parityMismatches += 1;
    continue;
  }
  const fields = ["games", "goals", "assists", "wins", "draws", "losses", "points", "ranking_points"];
  const mismatch = numeric(row.rounds_count) !== expected.rounds_count.size
    || fields.some((field) => Math.abs(numeric(row[field]) - numeric(expected[field])) > 0.001);
  if (mismatch) parityMismatches += 1;
}

const leakedRoundStats = rawRows.filter((row) => row.league_id !== target.season.league_id).length;
const report = {
  project: new URL(env.NEXT_PUBLIC_SUPABASE_URL).host,
  iterations,
  dataset: {
    seasons: seasons?.length || 0,
    finishedOfficialRounds: roundIds.length,
    seasonPlayers: viewResult.data?.length || 0,
    roundStatRows: rawRows.length,
  },
  integrity: {
    seasonViewParityMismatches: parityMismatches,
    wrongLeagueRounds,
    leakedRoundStats,
  },
  latency: {
    seasonView: seasonViewMetric,
    rankingHistory: rankingHistoryMetric,
    playerHistory: playerHistoryMetric,
  },
  transportBudget: {
    p95Under1000Ms: [seasonViewMetric, rankingHistoryMetric, playerHistoryMetric]
      .filter(Boolean)
      .every((metric) => metric.p95Ms < 1000),
  },
};

console.log(JSON.stringify(report, null, 2));
if (parityMismatches || wrongLeagueRounds || leakedRoundStats) process.exitCode = 2;
