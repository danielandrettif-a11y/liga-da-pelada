import type { Pool } from "pg";
import type { OperationsRepository } from "../application/manage-operations.js";
import type {
  PerformanceSummaryRow,
  ServerEventInput,
} from "../domain/operations.js";

export class PgOperationsRepository implements OperationsRepository {
  constructor(private readonly pool: Pool) {}

  async getPerformanceSummary(hours: number): Promise<PerformanceSummaryRow[]> {
    const res = await this.pool.query(
      `SELECT * FROM get_app_performance_summary($1)`,
      [hours]
    ).catch(() => ({ rows: [] }));

    return res.rows.map((r: any) => ({
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
      `INSERT INTO server_events (kind, name, message, path, value, rating, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        event.kind,
        event.name,
        event.message || null,
        event.path || null,
        event.value !== undefined ? event.value : null,
        event.rating || null,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ]
    ).catch(() => {});

    return { success: true };
  }
}
