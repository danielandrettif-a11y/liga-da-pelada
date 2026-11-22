import type { Actor } from "../../../shared/actor.js";
import {
  FORMULA_KEY,
  COMPARISON_FORMULA_KEY,
  buildOverallShadowAdminData,
  validateRunForPublication,
  type OverallShadowAdminData,
} from "../domain/overall-shadow.js";

export type OverallPlayerSource = {
  id: string;
  name: string;
  playerProfile?: string | null;
  initialPlayerProfile?: string | null;
  overallTraits: string[];
  overallSeedMode?: string | null;
  isGoalkeeper: boolean;
};

export type OverallHistoryData = {
  players: OverallPlayerSource[];
  pendingPlayers: Array<{ id: string; name: string }>;
  rounds: any[];
  zeroPointOverrides: any[];
};

export interface OverallShadowRepository {
  checkIsAdmin(actor: Actor, leagueId: string): Promise<boolean>;
  getFormula(key: string): Promise<{ id: string; label: string; config?: any } | null>;
  loadHistory(leagueId: string): Promise<OverallHistoryData>;
  getLatestRun(leagueId: string, formulaId: string): Promise<{
    id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    error_message: string | null;
    formula_version_id: string;
  } | null>;
  getRunById(runId: string, leagueId: string): Promise<{
    id: string;
    status: string;
    formula_version_id: string;
  } | null>;
  getSnapshots(runId: string): Promise<any[]>;
  getBreakdowns(runId: string): Promise<any[]>;
  createRun(params: {
    leagueId: string;
    formulaVersionId: string;
    sourceThroughRoundId: string | null;
    createdBy: string;
  }): Promise<string>;
  saveCalculatedData(params: {
    runId: string;
    snapshots: any[];
    breakdowns: any[];
  }): Promise<void>;
  markRunSucceeded(runId: string, leagueId: string): Promise<void>;
  markRunFailed(runId: string, leagueId: string, error: string): Promise<void>;
  markRunPublished(runId: string, leagueId: string): Promise<void>;
}

export type ManageOverallShadowService = {
  getOverallShadowAdminData(actor: Actor, leagueId: string): Promise<OverallShadowAdminData | null>;
  recalculateOverallShadow(actor: Actor, leagueId: string): Promise<{
    success: boolean;
    error?: string;
    runId?: string;
    players?: number;
    pendingPlayers?: number;
    rounds?: number;
  }>;
  publishOverallShadow(actor: Actor, leagueId: string, runId: string): Promise<{ success: boolean; error?: string }>;
  recalculateAndPublishFluidOverall(actor: Actor, leagueId: string): Promise<{
    success: boolean;
    error?: string;
    runId?: string;
    published?: boolean;
  }>;
  refreshFluidOverallSafely(actor: Actor, leagueId: string, reason: string): Promise<{ success: boolean; error?: string }>;
};

export function createManageOverallShadowService(
  repository: OverallShadowRepository,
  calculationEngine?: {
    parseFormulaConfig: (config: any) => any;
    calculateOveralls: (players: any[], rounds: any[], config: any) => { snapshots: any[]; breakdowns: any[] };
  },
): ManageOverallShadowService {
  return {
    async getOverallShadowAdminData(actor: Actor, leagueId: string): Promise<OverallShadowAdminData | null> {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) return null;

      const formula = await repository.getFormula(FORMULA_KEY);
      if (!formula) {
        return { latestRun: null, snapshots: [], pendingPlayers: [] };
      }

      const history = await repository.loadHistory(leagueId);
      const latestRun = await repository.getLatestRun(leagueId, formula.id);
      if (!latestRun) {
        return { latestRun: null, snapshots: [], pendingPlayers: history.pendingPlayers };
      }

      const comparisonFormula = await repository.getFormula(COMPARISON_FORMULA_KEY);
      const comparisonRun = comparisonFormula
        ? await repository.getLatestRun(leagueId, comparisonFormula.id)
        : null;

      const [snapshots, breakdowns, comparisonSnapshots] = await Promise.all([
        repository.getSnapshots(latestRun.id),
        repository.getBreakdowns(latestRun.id),
        comparisonRun ? repository.getSnapshots(comparisonRun.id) : Promise.resolve([]),
      ]);

      return buildOverallShadowAdminData({
        latestRun,
        formulaLabel: formula.label,
        pendingPlayers: history.pendingPlayers,
        snapshots,
        breakdowns,
        comparisonSnapshots,
      });
    },

    async recalculateOverallShadow(actor: Actor, leagueId: string) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) {
        return { success: false, error: "Somente administradores podem recalcular o OVR." };
      }

      const formula = await repository.getFormula(FORMULA_KEY);
      if (!formula) {
        return { success: false, error: "A fórmula v20 não foi encontrada. Confirme a migration 242." };
      }

      const history = await repository.loadHistory(leagueId);
      const latestRound = [...history.rounds]
        .filter((r) => r.roundType === "official" && r.status === "finished")
        .at(-1);

      let runId: string | null = null;
      try {
        runId = await repository.createRun({
          leagueId,
          formulaVersionId: formula.id,
          sourceThroughRoundId: latestRound?.id || null,
          createdBy: actor.userId,
        });

        const validPlayers = history.players.filter(
          (p) => (p.overallTraits || []).length >= 1 && (p.overallTraits || []).length <= 2,
        );

        let snapshots: any[] = [];
        let breakdowns: any[] = [];

        if (calculationEngine) {
          const parsedConfig = calculationEngine.parseFormulaConfig(formula.config);
          const result = calculationEngine.calculateOveralls(validPlayers, history.rounds, parsedConfig);
          snapshots = result.snapshots;
          breakdowns = result.breakdowns;
        }

        await repository.saveCalculatedData({ runId, snapshots, breakdowns });
        await repository.markRunSucceeded(runId, leagueId);

        return {
          success: true,
          runId,
          players: snapshots.length || validPlayers.length,
          pendingPlayers: history.pendingPlayers.length,
          rounds: history.rounds.length,
        };
      } catch (err: any) {
        if (runId) {
          await repository.markRunFailed(runId, leagueId, err.message || "Erro desconhecido");
        }
        return { success: false, error: err.message || "Não foi possível calcular os OVRs." };
      }
    },

    async publishOverallShadow(actor: Actor, leagueId: string, runId: string) {
      const isAdmin = await repository.checkIsAdmin(actor, leagueId);
      if (!isAdmin) {
        return { success: false, error: "Somente administradores podem publicar o OVR." };
      }

      const formula = await repository.getFormula(FORMULA_KEY);
      if (!formula) {
        return { success: false, error: "A fórmula v20 não foi encontrada." };
      }

      const run = await repository.getRunById(runId, leagueId);
      const validation = validateRunForPublication(run, formula.id);
      if (!validation.valid) {
        return { success: false, error: validation.reason };
      }

      try {
        await repository.markRunPublished(runId, leagueId);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },

    async recalculateAndPublishFluidOverall(actor: Actor, leagueId: string) {
      const recalculation = await this.recalculateOverallShadow(actor, leagueId);
      if (!recalculation.success || !recalculation.runId) {
        return recalculation;
      }
      const publication = await this.publishOverallShadow(actor, leagueId, recalculation.runId);
      return publication.success
        ? { ...recalculation, published: true }
        : { success: false, error: publication.error, runId: recalculation.runId };
    },

    async refreshFluidOverallSafely(actor: Actor, leagueId: string, reason: string) {
      const result = await this.recalculateAndPublishFluidOverall(actor, leagueId);
      if (!result.success) {
        console.error(`Falha ao atualizar OVR com tags fixas (${reason}):`, result.error);
      }
      return result;
    },
  };
}
