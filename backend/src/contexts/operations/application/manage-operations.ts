import {
  type PerformanceSummaryRow,
  type ServerEventInput,
  validateServerEvent,
} from "../domain/operations.js";
import type { Actor } from "../../../shared/actor.js";

export interface OperationsRepository {
  getPerformanceSummary(actor: Actor, hours: number): Promise<PerformanceSummaryRow[]>;
  recordServerEvent(event: ServerEventInput): Promise<{ success: boolean; error?: string }>;
}

export class ManageOperationsUseCase {
  constructor(private readonly repository: OperationsRepository) {}

  async getPerformanceSummary(actor: Actor, hours: number): Promise<PerformanceSummaryRow[]> {
    const raw = Number.isFinite(hours) ? hours : 24;
    const validHours = Math.max(1, Math.min(720, Math.trunc(raw)));
    return this.repository.getPerformanceSummary(actor, validHours);
  }

  async recordServerEvent(event: ServerEventInput): Promise<{ success: boolean; error?: string }> {
    const val = validateServerEvent(event);
    if (!val.valid) {
      return { success: false, error: val.error };
    }
    return this.repository.recordServerEvent(event);
  }
}
