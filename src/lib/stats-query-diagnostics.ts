/** Diagnóstico temporário, sem identificadores de conta, pelada ou jogador. */
export function logStatsQuery(
  operation: "season_ranking" | "roster_totals" | "ranking_history",
  source: "season_view" | "round_stats",
  startedAt: number,
  rowCount: number,
  failed: boolean,
) {
  if (process.env.STATS_QUERY_DIAGNOSTICS !== "1") return;
  console.info(JSON.stringify({
    event: "stats_query",
    operation,
    source,
    durationMs: Math.round(performance.now() - startedAt),
    rowCount,
    failed,
  }));
}
