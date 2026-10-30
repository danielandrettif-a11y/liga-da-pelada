import {
  type PerformanceSummaryRow,
  type ServerEventInput,
  validateServerEvent,
} from "../domain/operations.js";

export interface OperationsRepository {
  getPerformanceSummary(hours: number): Promise<PerformanceSummaryRow[]>;
  recordServerEvent(event: ServerEventInput): Promise<{ success: boolean; error?: string }>;
}

export class ManageOperationsUseCase {
  constructor(private readonly repository: OperationsRepository) {}

  async getPerformanceSummary(hours: number): Promise<PerformanceSummaryRow[]> {
    const raw = Number.isFinite(hours) ? hours : 24;
    const validHours = Math.max(1, Math.min(720, Math.trunc(raw)));
    return this.repository.getPerformanceSummary(validHours);
  }

  async recordServerEvent(event: ServerEventInput): Promise<{ success: boolean; error?: string }> {
    const val = validateServerEvent(event);
    if (!val.valid) {
      return { success: false, error: val.error };
    }
    return this.repository.recordServerEvent(event);
  }
}
