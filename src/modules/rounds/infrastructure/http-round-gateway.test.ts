import { describe, expect, it, vi } from "vitest";
import { httpRoundGateway, RoundApiError } from "./http-round-gateway";

const backendUrl = "https://backend.example.com";
const leagueId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const teamId = "00000000-0000-4000-8000-000000000003";
const draftId = "00000000-0000-4000-8000-000000000004";

describe("httpRoundGateway", () => {
  it("fetches rounds by season", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ id: roundId }]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpRoundGateway(backendUrl, "test-token");
    const result = await gateway.getRounds("season-1");

    expect(result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/seasons/season-1`,
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer test-token" }),
      }),
    );
  });

  it("fetches round by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: roundId }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpRoundGateway(backendUrl);
    const result = await gateway.getRound(leagueId, roundId);

    expect(result.id).toBe(roundId);
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/${roundId}`,
      expect.anything(),
    );
  });

  it("creates a round with teams", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ roundId }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpRoundGateway(backendUrl, "test-token");
    const result = await gateway.createRoundWithTeams(leagueId, { date: "2026-10-30", teams: [] });

    expect(result.roundId).toBe(roundId);
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ date: "2026-10-30", teams: [] }),
      }),
    );
  });

  it("throws RoundApiError on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ message: "Dados inválidos." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpRoundGateway(backendUrl);
    await expect(gateway.deleteRound(leagueId, roundId)).rejects.toThrow(RoundApiError);
  });
});
