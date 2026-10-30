import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  getActiveLeague: vi.fn(),
  statisticsApiFor: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentAccount: mocks.getCurrentAccount,
}));

vi.mock("./rounds", () => ({
  getActiveLeague: mocks.getActiveLeague,
}));

vi.mock("@/modules/statistics/infrastructure/statistics-api-session", () => ({
  statisticsApiFor: mocks.statisticsApiFor,
}));

import {
  getBQScoringRules,
  getColumnCScoringRules,
  saveBQScoringRules,
  saveColumnCScoringRules,
} from "./bq-scoring";
import { DEFAULT_COLUMN_C_SCORING } from "../column-c-scoring";
import { BQ_SCORING_V5 } from "../bq-scoring";

describe("bq-scoring actions (parity & fallback)", () => {
  const leagueId = "00000000-0000-4000-8000-000000000001";
  const fakeLeague = { id: leagueId, name: "Pelada Teste" };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getActiveLeague.mockResolvedValue(fakeLeague);
  });

  describe("getBQScoringRules", () => {
    it("routes through API when statisticsApiFor returns gateway", async () => {
      const mockGateway = {
        getBQScoringRules: vi.fn().mockResolvedValue(BQ_SCORING_V5),
      };
      mocks.statisticsApiFor.mockResolvedValue(mockGateway);
      mocks.getCurrentAccount.mockResolvedValue({
        client: {},
        isAdmin: true,
      });

      const result = await getBQScoringRules();
      expect(result).toEqual(BQ_SCORING_V5);
      expect(mockGateway.getBQScoringRules).toHaveBeenCalledWith(leagueId);
    });

    it("falls back to Supabase query when statisticsApiFor returns null", async () => {
      mocks.statisticsApiFor.mockResolvedValue(null);
      const fakeClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { event_type: "goal", points: 4 },
                { event_type: "assist", points: 2.5 },
                { event_type: "win", points: 3 },
                { event_type: "draw", points: 1 },
                { event_type: "loss", points: -2.5 },
                { event_type: "own_goal", points: -3 },
                { event_type: "goalkeeper_appearance", points: 2 },
                { event_type: "goal_conceded", points: -1 },
              ],
              error: null,
            }),
          }),
        }),
      };
      mocks.getCurrentAccount.mockResolvedValue({
        client: fakeClient,
        isAdmin: true,
      });

      const result = await getBQScoringRules();
      expect(result).toEqual(BQ_SCORING_V5);
      expect(fakeClient.from).toHaveBeenCalledWith("ranking_rules");
    });
  });

  describe("getColumnCScoringRules", () => {
    it("routes through API when statisticsApiFor returns gateway", async () => {
      const mockGateway = {
        getColumnCScoringRules: vi.fn().mockResolvedValue(DEFAULT_COLUMN_C_SCORING),
      };
      mocks.statisticsApiFor.mockResolvedValue(mockGateway);
      mocks.getCurrentAccount.mockResolvedValue({
        client: {},
        isAdmin: true,
      });

      const result = await getColumnCScoringRules();
      expect(result).toEqual(DEFAULT_COLUMN_C_SCORING);
      expect(mockGateway.getColumnCScoringRules).toHaveBeenCalledWith(leagueId);
    });

    it("falls back to Supabase query when statisticsApiFor returns null", async () => {
      mocks.statisticsApiFor.mockResolvedValue(null);
      const fakeClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      };
      mocks.getCurrentAccount.mockResolvedValue({
        client: fakeClient,
        isAdmin: true,
      });

      const result = await getColumnCScoringRules();
      expect(result).toEqual(DEFAULT_COLUMN_C_SCORING);
      expect(fakeClient.from).toHaveBeenCalledWith("fantasy_settings");
    });
  });

  describe("saveBQScoringRules", () => {
    it("rejects when current user is not admin", async () => {
      mocks.getCurrentAccount.mockResolvedValue({
        client: {},
        isAdmin: false,
      });

      const result = await saveBQScoringRules(BQ_SCORING_V5);
      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem alterar as regras de pontuação.",
      });
    });

    it("routes through API when statisticsApiFor returns gateway", async () => {
      const mockGateway = {
        saveBQScoringRules: vi.fn().mockResolvedValue({ success: true, version: 5 }),
      };
      mocks.statisticsApiFor.mockResolvedValue(mockGateway);
      mocks.getCurrentAccount.mockResolvedValue({
        client: {},
        isAdmin: true,
      });

      const result = await saveBQScoringRules(BQ_SCORING_V5);
      expect(result).toEqual({ success: true, version: 5 });
      expect(mockGateway.saveBQScoringRules).toHaveBeenCalledWith(leagueId, BQ_SCORING_V5);
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/pontuacao");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/ranking");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/cartola");
    });

    it("falls back to Supabase RPC when statisticsApiFor returns null", async () => {
      mocks.statisticsApiFor.mockResolvedValue(null);
      const fakeClient = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      mocks.getCurrentAccount.mockResolvedValue({
        client: fakeClient,
        isAdmin: true,
      });

      const result = await saveBQScoringRules(BQ_SCORING_V5);
      expect(result).toEqual({ success: true });
      expect(fakeClient.rpc).toHaveBeenCalledWith("save_bq_scoring_rules", {
        p_league_id: leagueId,
        p_snapshot: BQ_SCORING_V5,
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/pontuacao");
    });
  });

  describe("saveColumnCScoringRules", () => {
    it("rejects when current user is not admin", async () => {
      mocks.getCurrentAccount.mockResolvedValue({
        client: {},
        isAdmin: false,
      });

      const result = await saveColumnCScoringRules(DEFAULT_COLUMN_C_SCORING);
      expect(result).toEqual({
        success: false,
        error: "Apenas administradores podem alterar as regras de pontuação.",
      });
    });

    it("routes through API when statisticsApiFor returns gateway", async () => {
      const mockGateway = {
        saveColumnCScoringRules: vi.fn().mockResolvedValue({
          success: true,
          roundsReprocessed: 3,
          playerRoundsReprocessed: 36,
        }),
      };
      mocks.statisticsApiFor.mockResolvedValue(mockGateway);
      mocks.getCurrentAccount.mockResolvedValue({
        client: {},
        isAdmin: true,
      });

      const result = await saveColumnCScoringRules(DEFAULT_COLUMN_C_SCORING, {
        reprocessRanked: true,
      });
      expect(result).toEqual({
        success: true,
        roundsReprocessed: 3,
        playerRoundsReprocessed: 36,
      });
      expect(mockGateway.saveColumnCScoringRules).toHaveBeenCalledWith(
        leagueId,
        DEFAULT_COLUMN_C_SCORING,
        { reprocessRanked: true },
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/pontuacao");
    });

    it("falls back to Supabase RPC when statisticsApiFor returns null", async () => {
      mocks.statisticsApiFor.mockResolvedValue(null);
      const fakeClient = {
        rpc: vi.fn().mockResolvedValue({
          data: { rounds_reprocessed: 1, player_rounds_reprocessed: 12 },
          error: null,
        }),
      };
      mocks.getCurrentAccount.mockResolvedValue({
        client: fakeClient,
        isAdmin: true,
      });

      const result = await saveColumnCScoringRules(DEFAULT_COLUMN_C_SCORING, {
        reprocessRanked: false,
      });
      expect(result).toEqual({
        success: true,
        roundsReprocessed: 1,
        playerRoundsReprocessed: 12,
      });
      expect(fakeClient.rpc).toHaveBeenCalledWith(
        "save_column_c_scoring_settings",
        expect.objectContaining({
          p_league_id: leagueId,
          p_reprocess_ranked: false,
        }),
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/pontuacao");
    });
  });
});
