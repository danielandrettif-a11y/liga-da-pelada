import { afterEach, describe, expect, it, vi } from "vitest";
import {
  measureMatchStep,
  resetMatchPerformanceDiagnostics,
  summarizeMatchStepSamples,
} from "./match-performance";

afterEach(() => {
  delete process.env.MATCH_PERF_DIAGNOSTICS;
  delete process.env.MATCH_PERF_SUMMARY_EVERY;
  resetMatchPerformanceDiagnostics();
  vi.restoreAllMocks();
});

describe("measureMatchStep", () => {
  it("não emite logs quando o diagnóstico está desligado", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await measureMatchStep("register_goal", "save_goal_rpc", async () => 42)).toBe(42);
    expect(log).not.toHaveBeenCalled();
  });

  it("emite somente operação, etapa, duração e resultado", async () => {
    process.env.MATCH_PERF_DIAGNOSTICS = "1";
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(measureMatchStep("finish_match", "recalculate_stats", async () => { throw new Error("falha"); }))
      .rejects.toThrow("falha");
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
      event: "match_step",
      operation: "finish_match",
      step: "recalculate_stats",
      success: false,
    });
  });

  it("calcula p50, p95, máximo e falhas por etapa", () => {
    expect(summarizeMatchStepSamples([
      { durationMs: 12, failed: false },
      { durationMs: 30, failed: true },
      { durationMs: 18, failed: false },
      { durationMs: 90, failed: false },
    ])).toEqual({
      count: 4,
      failures: 1,
      p50DurationMs: 18,
      p95DurationMs: 90,
      maxDurationMs: 90,
    });
  });

  it("emite um resumo no intervalo configurado", async () => {
    process.env.MATCH_PERF_DIAGNOSTICS = "1";
    process.env.MATCH_PERF_SUMMARY_EVERY = "2";
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await measureMatchStep("create_match", "save_rpc", async () => true);
    await measureMatchStep("create_match", "save_rpc", async () => true);
    expect(log).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(log.mock.calls[2][0]))).toMatchObject({
      event: "match_step_summary",
      operation: "create_match",
      step: "save_rpc",
      count: 2,
      failures: 0,
    });
  });
});
