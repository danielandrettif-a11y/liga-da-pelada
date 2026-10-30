import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BQ_SCORING_V5 } from "@/lib/bq-scoring";
import { DEFAULT_COLUMN_C_SCORING } from "@/lib/column-c-scoring";
import {
  httpStatisticsGateway,
  StatisticsApiError,
} from "./http-statistics-gateway";

describe("httpStatisticsGateway", () => {
  const baseUrl = "https://api.liga.test";
  const accessToken = "valid-token";
  const leagueId = "00000000-0000-4000-8000-000000000001";

  it("fetches BQ scoring rules via GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => BQ_SCORING_V5,
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpStatisticsGateway(baseUrl, accessToken);
    const result = await gateway.getBQScoringRules(leagueId);

    expect(result).toEqual(BQ_SCORING_V5);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/statistics/leagues/${leagueId}/scoring/bq`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${accessToken}`,
        }),
      }),
    );
  });

  it("fetches Column C scoring rules via GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => DEFAULT_COLUMN_C_SCORING,
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpStatisticsGateway(baseUrl, accessToken);
    const result = await gateway.getColumnCScoringRules(leagueId);

    expect(result).toEqual(DEFAULT_COLUMN_C_SCORING);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/statistics/leagues/${leagueId}/scoring/column-c`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${accessToken}`,
        }),
      }),
    );
  });

  it("saves BQ scoring rules via PUT", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, version: 5 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpStatisticsGateway(baseUrl, accessToken);
    const result = await gateway.saveBQScoringRules(leagueId, BQ_SCORING_V5);

    expect(result).toEqual({ success: true, version: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/statistics/leagues/${leagueId}/scoring/bq`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        }),
        body: JSON.stringify(BQ_SCORING_V5),
      }),
    );
  });

  it("saves Column C scoring rules via PUT", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        roundsReprocessed: 2,
        playerRoundsReprocessed: 24,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpStatisticsGateway(baseUrl, accessToken);
    const result = await gateway.saveColumnCScoringRules(
      leagueId,
      DEFAULT_COLUMN_C_SCORING,
      { reprocessRanked: true },
    );

    expect(result).toEqual({
      success: true,
      roundsReprocessed: 2,
      playerRoundsReprocessed: 24,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/statistics/leagues/${leagueId}/scoring/column-c`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          settings: DEFAULT_COLUMN_C_SCORING,
          options: { reprocessRanked: true },
        }),
      }),
    );
  });

  it("throws StatisticsApiError when server responds with error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: "Apenas administradores podem alterar as regras." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpStatisticsGateway(baseUrl, accessToken);
    await expect(gateway.saveBQScoringRules(leagueId, BQ_SCORING_V5)).rejects.toThrow(
      StatisticsApiError,
    );
  });

  it("fetches general ranking via GET", async () => {
    const mockRanking = [{ player: { id: "p1", name: "Player 1" }, points: 25 }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockRanking,
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpStatisticsGateway(baseUrl, accessToken);
    const result = await gateway.getRanking(leagueId);

    expect(result).toEqual(mockRanking);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/statistics/leagues/${leagueId}/ranking`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${accessToken}`,
        }),
      }),
    );
  });

  it("fetches ranking experience via GET", async () => {
    const mockExperience = {
      seasonLabel: "Temporada 2 · 2026",
      general: [],
      monthly: null,
      latestRound: null,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockExperience,
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpStatisticsGateway(baseUrl, accessToken);
    const result = await gateway.getRankingExperience(leagueId, { includeEnrichment: false });

    expect(result).toEqual(mockExperience);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/statistics/leagues/${leagueId}/ranking/experience?includeEnrichment=false`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${accessToken}`,
        }),
      }),
    );
  });

  it("fetches player ranking entry via GET or returns null on 404", async () => {
    const mockEntry = { entry: { player: { id: "p1" } }, position: 1 };
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/players/p1")) {
        return { ok: true, json: async () => mockEntry };
      }
      return { ok: false, status: 404, json: async () => ({ code: "PLAYER_NOT_FOUND" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpStatisticsGateway(baseUrl, accessToken);
    const resultOk = await gateway.getPlayerRankingEntry(leagueId, "p1");
    expect(resultOk).toEqual(mockEntry);

    const result404 = await gateway.getPlayerRankingEntry(leagueId, "p2");
    expect(result404).toBeNull();
  });

  it("fetches ranking enrichment for players via POST", async () => {
    const mockEnrichment = { p1: { overall: 85, speedRating: 3 } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockEnrichment,
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpStatisticsGateway(baseUrl, accessToken);
    const result = await gateway.getRankingEnrichmentForPlayers(leagueId, ["p1"]);

    expect(result).toEqual(mockEnrichment);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/statistics/leagues/${leagueId}/ranking/enrichment`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        }),
        body: JSON.stringify({ playerIds: ["p1"] }),
      }),
    );
  });
});
