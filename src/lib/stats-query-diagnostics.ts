export type StatsQueryOperation = "season_ranking" | "roster_totals" | "ranking_history" | "player_history";
export type StatsQuerySource = "season_view" | "round_stats";

type StatsQuerySample = {
  durationMs: number;
  rowCount: number;
  failed: boolean;
};

export type StatsQuerySummary = {
  count: number;
  failures: number;
  p50DurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  averageRowCount: number;
};

const MAX_SAMPLES_PER_QUERY = 200;
const samplesByQuery = new Map<string, StatsQuerySample[]>();

function percentile(sorted: number[], ratio: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

export function summarizeStatsQuerySamples(samples: StatsQuerySample[]): StatsQuerySummary {
  const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  return {
    count: samples.length,
    failures: samples.filter((sample) => sample.failed).length,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    maxDurationMs: durations.at(-1) || 0,
    averageRowCount: samples.length > 0
      ? Math.round(samples.reduce((total, sample) => total + sample.rowCount, 0) / samples.length)
      : 0,
  };
}

export function resetStatsQueryDiagnostics() {
  samplesByQuery.clear();
}

/** Diagnóstico temporário, sem identificadores de conta, pelada ou jogador. */
export function logStatsQuery(
  operation: StatsQueryOperation,
  source: StatsQuerySource,
  startedAt: number,
  rowCount: number,
  failed: boolean,
) {
  if (process.env.STATS_QUERY_DIAGNOSTICS !== "1") return;
  const sample = {
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    rowCount,
    failed,
  };
  console.info(JSON.stringify({
    event: "stats_query",
    operation,
    source,
    ...sample,
  }));

  const key = `${operation}:${source}`;
  const samples = samplesByQuery.get(key) || [];
  samples.push(sample);
  if (samples.length > MAX_SAMPLES_PER_QUERY) samples.shift();
  samplesByQuery.set(key, samples);

  const configuredInterval = Number(process.env.STATS_QUERY_SUMMARY_EVERY || 20);
  const summaryEvery = Number.isInteger(configuredInterval) && configuredInterval > 0 ? configuredInterval : 20;
  if (samples.length % summaryEvery === 0) {
    console.info(JSON.stringify({
      event: "stats_query_summary",
      operation,
      source,
      ...summarizeStatsQuerySamples(samples),
    }));
  }
}
