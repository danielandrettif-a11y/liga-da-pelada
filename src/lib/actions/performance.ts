"use server";

import { createClient } from "@/lib/supabase/server";
import { operationsApi } from "@/modules/operations/infrastructure/operations-api-session";

export type PerformanceSummaryRow = {
  kind: string;
  name: string;
  path: string;
  samples: number;
  p50_ms: number | null;
  p95_ms: number | null;
  max_ms: number | null;
  poor_or_failed: number;
};

export async function getPerformanceSummary(hours = 24): Promise<PerformanceSummaryRow[]> {
  const opsApi = await operationsApi();
  if (opsApi) {
    return opsApi.getPerformanceSummary(hours);
  }
  const client = await createClient();
  const { data, error } = await client.rpc("get_app_performance_summary", {
    p_hours: Math.max(1, Math.min(720, Math.trunc(hours))),
  });
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => ({
    ...(row as PerformanceSummaryRow),
    samples: Number((row as PerformanceSummaryRow).samples || 0),
    p50_ms: (row as PerformanceSummaryRow).p50_ms === null ? null : Number((row as PerformanceSummaryRow).p50_ms),
    p95_ms: (row as PerformanceSummaryRow).p95_ms === null ? null : Number((row as PerformanceSummaryRow).p95_ms),
    max_ms: (row as PerformanceSummaryRow).max_ms === null ? null : Number((row as PerformanceSummaryRow).max_ms),
    poor_or_failed: Number((row as PerformanceSummaryRow).poor_or_failed || 0),
  }));
}
