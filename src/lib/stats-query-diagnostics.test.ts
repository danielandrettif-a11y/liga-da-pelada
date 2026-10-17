import { afterEach, describe, expect, it, vi } from "vitest";
import { logStatsQuery } from "./stats-query-diagnostics";

afterEach(() => {
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
});
