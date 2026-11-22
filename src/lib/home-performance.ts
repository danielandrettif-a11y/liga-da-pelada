export function homeTraceId(value: unknown) {
  return process.env.MATCH_PERF_DIAGNOSTICS === "1"
    && typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)
    ? value : undefined;
}
