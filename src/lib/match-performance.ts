export type MatchOperation = "create_match" | "register_goal" | "finish_match";

type MatchStepSample = { durationMs: number; failed: boolean };
export type MatchStepSummary = {
  count: number;
  failures: number;
  p50DurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
};

const MAX_SAMPLES_PER_STEP = 200;
const samplesByStep = new Map<string, MatchStepSample[]>();

function percentile(sorted: number[], ratio: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

export function summarizeMatchStepSamples(samples: MatchStepSample[]): MatchStepSummary {
  const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  return {
    count: samples.length,
    failures: samples.filter((sample) => sample.failed).length,
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    maxDurationMs: durations.at(-1) || 0,
  };
}

export function resetMatchPerformanceDiagnostics() {
  samplesByStep.clear();
}

function recordMatchStep(operation: MatchOperation, step: string, durationMs: number, success: boolean) {
  console.info(JSON.stringify({ event: "match_step", operation, step, durationMs, success }));
  const key = `${operation}:${step}`;
  const samples = samplesByStep.get(key) || [];
  samples.push({ durationMs, failed: !success });
  if (samples.length > MAX_SAMPLES_PER_STEP) samples.shift();
  samplesByStep.set(key, samples);

  const configured = Number(process.env.MATCH_PERF_SUMMARY_EVERY || 20);
  const summaryEvery = Number.isInteger(configured) && configured > 0 ? configured : 20;
  if (samples.length % summaryEvery === 0) {
    console.info(JSON.stringify({
      event: "match_step_summary",
      operation,
      step,
      ...summarizeMatchStepSamples(samples),
    }));
  }
}

/** Diagnóstico opt-in das etapas críticas; nunca registra IDs ou dados pessoais. */
export async function measureMatchStep<T>(
  operation: MatchOperation,
  step: string,
  run: () => Promise<T>,
): Promise<T> {
  if (process.env.MATCH_PERF_DIAGNOSTICS !== "1") return run();
  const startedAt = performance.now();
  let success = false;
  try {
    const value = await run();
    success = true;
    return value;
  } finally {
    recordMatchStep(operation, step, Math.round(performance.now() - startedAt), success);
  }
}
