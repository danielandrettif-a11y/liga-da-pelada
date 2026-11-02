import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { OperationsRepository } from "../application/manage-operations.js";
import type {
  PerformanceSummaryRow,
  ServerEventInput,
} from "../domain/operations.js";

export class PgOperationsRepository implements OperationsRepository {
  constructor(private readonly pool: Pool) {}

  async getPerformanceSummary(actor: Actor, hours: number): Promise<PerformanceSummaryRow[]> {
    const rows = await withAuthenticatedTransaction(this.pool, actor, async (client) => {
      const res = await client.query<{ summary: unknown }>(
        "SELECT public.get_app_performance_summary($1::integer) AS summary",
        [hours],
      );
      const summary = res.rows[0]?.summary;
      return Array.isArray(summary) ? summary as Record<string, unknown>[] : [];
    });

    return rows.map((r: any) => ({
      kind: r.kind,
      name: r.name,
      path: r.path,
      samples: Number(r.samples || 0),
      p50_ms: r.p50_ms !== null && r.p50_ms !== undefined ? Number(r.p50_ms) : null,
      p95_ms: r.p95_ms !== null && r.p95_ms !== undefined ? Number(r.p95_ms) : null,
      max_ms: r.max_ms !== null && r.max_ms !== undefined ? Number(r.max_ms) : null,
      poor_or_failed: Number(r.poor_or_failed || 0),
    }));
  }

  async recordServerEvent(event: ServerEventInput): Promise<{ success: boolean; error?: string }> {
    await this.pool.query(
      `INSERT INTO public.app_performance_events
         (kind, name, message, path, value, rating, metadata, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())`,
      [
        event.kind,
        event.name,
        event.message || null,
        event.path || null,
        event.value !== undefined ? event.value : null,
        event.rating || null,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ]
    );

    return { success: true };
  }
}
