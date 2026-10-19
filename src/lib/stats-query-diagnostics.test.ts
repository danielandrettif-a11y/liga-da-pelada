import { afterEach, describe, expect, it, vi } from "vitest";
import { logStatsQuery, resetStatsQueryDiagnostics, summarizeStatsQuerySamples } from "./stats-query-diagnostics";

afterEach(() => {
  resetStatsQueryDiagnostics();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("diagnóstico de consultas de estatísticas", () => {
  it("não emite logs por padrão", () => {
    vi.stubEnv("STATS_QUERY_DIAGNOSTICS", "0");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logStatsQuery("season_ranking", "season_view", performance.now(), 24, false);
    expect(info).not.toHaveBeenCalled();
  });

  it("registra somente operação, fonte, duração, volume e erro quando ativado", () => {
    vi.stubEnv("STATS_QUERY_DIAGNOSTICS", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logStatsQuery("roster_totals", "season_view", performance.now(), 24, false);
    expect(info).toHaveBeenCalledOnce();
    expect(JSON.parse(String(info.mock.calls[0][0]))).toEqual({
      event: "stats_query",
      operation: "roster_totals",
      source: "season_view",
      durationMs: expect.any(Number),
      rowCount: 24,
      failed: false,
    });
  });

  it("calcula p50 e p95 para comparar as consultas", () => {
    expect(summarizeStatsQuerySamples([
      { durationMs: 10, rowCount: 10, failed: false },
      { durationMs: 30, rowCount: 30, failed: false },
      { durationMs: 20, rowCount: 20, failed: true },
      { durationMs: 100, rowCount: 40, failed: false },
    ])).toEqual({
      count: 4,
      failures: 1,
      p50DurationMs: 20,
      p95DurationMs: 100,
      maxDurationMs: 100,
      averageRowCount: 25,
    });
  });

  it("emite resumo no intervalo configurado", () => {
    vi.stubEnv("STATS_QUERY_DIAGNOSTICS", "1");
    vi.stubEnv("STATS_QUERY_SUMMARY_EVERY", "2");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logStatsQuery("player_history", "round_stats", performance.now(), 4, false);
    logStatsQuery("player_history", "round_stats", performance.now(), 6, false);
    expect(info).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(info.mock.calls[2][0]))).toMatchObject({
      event: "stats_query_summary",
      operation: "player_history",
      source: "round_stats",
      count: 2,
      averageRowCount: 5,
    });
  });
});
