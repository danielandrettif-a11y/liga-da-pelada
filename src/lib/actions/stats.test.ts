import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/modules/statistics/infrastructure/statistics-api-session", () => ({
  getStatisticsApiSession: vi.fn(),
}));

vi.mock("../league-context", () => ({
  getSelectedLeague: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("./seasons", () => ({
  getActiveSeason: vi.fn(),
  getActiveSeasonRoundIds: vi.fn(),
}));

vi.mock("../auth", () => ({
  getAdminClient: vi.fn(),
  getCurrentAccount: vi.fn(),
}));

vi.mock("./cosmetics", () => ({
  getAllPlayersEquippedCosmeticsMap: vi.fn().mockResolvedValue(new Map()),
}));

import { getStatisticsApiSession } from "@/modules/statistics/infrastructure/statistics-api-session";
import { getSelectedLeague } from "../league-context";
import { createClient as createServerClient } from "../supabase/server";
import { getActiveSeason } from "./seasons";
import { getCurrentAccount } from "../auth";
import {
  calculateRoundStats,
  getFriendlyStats,
  getPlayerRankingEntry,
  getRanking,
  getRankingEnrichmentForPlayers,
  getRankingEssentialData,
  getRankingExperienceData,
  getRoundStatistics,
} from "./stats";

describe("stats server actions parity", () => {
  const leagueId = "11111111-1111-4111-8111-111111111111";
  const playerId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSelectedLeague).mockResolvedValue({ id: leagueId, name: "Pelada Teste" } as any);
  });

  describe("getRanking", () => {
    it("routes to gateway when API session is active", async () => {
      const mockRanking = [{ player: { id: playerId, name: "Atleta 1" }, points: 30 } as any];
      const gateway = {
        getRanking: vi.fn().mockResolvedValue(mockRanking),
      };
      vi.mocked(getStatisticsApiSession).mockResolvedValue({
        gateway,
        accessToken: "test-token",
        backendUrl: "http://localhost:3001",
      } as any);

      const result = await getRanking();
      expect(result).toEqual(mockRanking);
      expect(gateway.getRanking).toHaveBeenCalledWith(leagueId);
    });

    it("falls back to legacy implementation when session is null", async () => {
      vi.mocked(getStatisticsApiSession).mockResolvedValue(null);
      vi.mocked(getActiveSeason).mockResolvedValue(null);

      const result = await getRanking();
      expect(result).toEqual([]);
    });
  });

  describe("getRankingEssentialData", () => {
    it("routes to gateway with includeEnrichment=false when session is active", async () => {
      const mockExperience = {
        seasonLabel: "Temporada 1 · 2026",
        general: [],
        monthly: null,
        latestRound: null,
      };
      const gateway = {
        getRankingExperience: vi.fn().mockResolvedValue(mockExperience),
      };
      vi.mocked(getStatisticsApiSession).mockResolvedValue({
        gateway,
        accessToken: "test-token",
        backendUrl: "http://localhost:3001",
      } as any);

      const result = await getRankingEssentialData();
      expect(result).toEqual(mockExperience);
      expect(gateway.getRankingExperience).toHaveBeenCalledWith(leagueId, { includeEnrichment: false });
    });

    it("falls back to legacy when session is null", async () => {
      vi.mocked(getStatisticsApiSession).mockResolvedValue(null);
      vi.mocked(getActiveSeason).mockResolvedValue(null);

      const result = await getRankingEssentialData();
      expect(result.general).toEqual([]);
      expect(result.seasonLabel).toBe("Temporada atual");
    });
  });

  describe("getRankingExperienceData", () => {
    it("routes to gateway with includeEnrichment=true when session is active", async () => {
      const mockExperience = {
        seasonLabel: "Temporada 2 · 2026",
        general: [{ player: { id: playerId }, points: 50 } as any],
        monthly: null,
        latestRound: null,
      };
      const gateway = {
        getRankingExperience: vi.fn().mockResolvedValue(mockExperience),
      };
      vi.mocked(getStatisticsApiSession).mockResolvedValue({
        gateway,
        accessToken: "test-token",
        backendUrl: "http://localhost:3001",
      } as any);

      const result = await getRankingExperienceData();
      expect(result).toEqual(mockExperience);
      expect(gateway.getRankingExperience).toHaveBeenCalledWith(leagueId, { includeEnrichment: true });
    });

    it("falls back to legacy when session is null", async () => {
      vi.mocked(getStatisticsApiSession).mockResolvedValue(null);
      vi.mocked(getActiveSeason).mockResolvedValue(null);

      const result = await getRankingExperienceData();
      expect(result.general).toEqual([]);
      expect(result.seasonLabel).toBe("Temporada atual");
    });
  });

  describe("getPlayerRankingEntry", () => {
    it("routes to gateway when session is active", async () => {
      const mockEntry = {
        entry: { player: { id: playerId, name: "Atleta" }, points: 15 } as any,
        position: 1,
      };
      const gateway = {
        getPlayerRankingEntry: vi.fn().mockResolvedValue(mockEntry),
      };
      vi.mocked(getStatisticsApiSession).mockResolvedValue({
        gateway,
        accessToken: "test-token",
        backendUrl: "http://localhost:3001",
      } as any);

      const result = await getPlayerRankingEntry(playerId);
      expect(result).toEqual(mockEntry);
      expect(gateway.getPlayerRankingEntry).toHaveBeenCalledWith(leagueId, playerId);
    });

    it("falls back to legacy when session is null and player not found", async () => {
      vi.mocked(getStatisticsApiSession).mockResolvedValue(null);
      vi.mocked(getActiveSeason).mockResolvedValue(null);

      const supabaseMock = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
      vi.mocked(createServerClient).mockResolvedValue(supabaseMock as any);

      const result = await getPlayerRankingEntry(playerId);
      expect(result).toBeNull();
    });
  });

  describe("getRankingEnrichmentForPlayers", () => {
    it("routes to gateway when session is active", async () => {
      const mockEnrichment = {
        [playerId]: { overall: 85, speedRating: 3 } as any,
      };
      const gateway = {
        getRankingEnrichmentForPlayers: vi.fn().mockResolvedValue(mockEnrichment),
      };
      vi.mocked(getStatisticsApiSession).mockResolvedValue({
        gateway,
        accessToken: "test-token",
        backendUrl: "http://localhost:3001",
      } as any);

      const result = await getRankingEnrichmentForPlayers([playerId]);
      expect(result).toEqual(mockEnrichment);
      expect(gateway.getRankingEnrichmentForPlayers).toHaveBeenCalledWith(leagueId, [playerId]);
    });

    it("falls back to legacy when session is null", async () => {
      vi.mocked(getStatisticsApiSession).mockResolvedValue(null);
      vi.mocked(getActiveSeason).mockResolvedValue(null);
      vi.mocked(getCurrentAccount).mockResolvedValue({ user: null } as any);

      const result = await getRankingEnrichmentForPlayers([playerId]);
      expect(result).toEqual({});
    });
  });

  describe("round statistics slice", () => {
    const roundId = "33333333-3333-4333-8333-333333333333";

    it("routes calculateRoundStats through the API and does not invoke legacy persistence", async () => {
      const gateway = { calculateRoundStats: vi.fn().mockResolvedValue({ success: true }) };
      vi.mocked(getStatisticsApiSession).mockResolvedValue({ gateway } as any);

      await expect(calculateRoundStats(roundId)).resolves.toEqual({ success: true });
      expect(gateway.calculateRoundStats).toHaveBeenCalledWith(leagueId, roundId);
    });

    it("returns the API error contract without a silent legacy mutation", async () => {
      const gateway = { calculateRoundStats: vi.fn().mockRejectedValue(new Error("backend indisponível")) };
      vi.mocked(getStatisticsApiSession).mockResolvedValue({ gateway } as any);

      await expect(calculateRoundStats(roundId)).resolves.toEqual({ success: false, error: "backend indisponível" });
    });

    it("routes getRoundStatistics through the API", async () => {
      const readModel = { roundId, roundType: "official", entries: [], highlights: {} };
      const gateway = { getRoundStatistics: vi.fn().mockResolvedValue(readModel) };
      vi.mocked(getStatisticsApiSession).mockResolvedValue({ gateway } as any);

      await expect(getRoundStatistics(roundId)).resolves.toEqual(readModel);
      expect(gateway.getRoundStatistics).toHaveBeenCalledWith(leagueId, roundId);
    });

    it("routes getFriendlyStats through the API", async () => {
      const friendlies = [{ player: { id: playerId, name: "Atleta" }, games: 2 }];
      const gateway = { getFriendlyStats: vi.fn().mockResolvedValue(friendlies) };
      vi.mocked(getStatisticsApiSession).mockResolvedValue({ gateway } as any);

      await expect(getFriendlyStats()).resolves.toEqual(friendlies);
      expect(gateway.getFriendlyStats).toHaveBeenCalledWith(leagueId);
    });
  });
});

