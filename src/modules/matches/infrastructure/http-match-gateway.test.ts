import { describe, expect, it, vi } from "vitest";
import { httpMatchGateway, MatchApiError } from "./http-match-gateway";

const backendUrl = "https://backend.example.com";
const leagueId = "00000000-0000-4000-8000-000000000001";
const matchId = "00000000-0000-4000-8000-000000000002";
const roundId = "00000000-0000-4000-8000-000000000003";

describe("httpMatchGateway", () => {
  it("fetches match by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: matchId }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpMatchGateway(backendUrl, "test-token");
    const result = await gateway.getMatch(leagueId, matchId);

    expect(result.id).toBe(matchId);
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/matches/leagues/${leagueId}/${matchId}`,
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer test-token" }),
      }),
    );
  });

  it("creates match via POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ matchId }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpMatchGateway(backendUrl);
    const result = await gateway.createMatch(leagueId, { round_id: roundId });

    expect(result.matchId).toBe(matchId);
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/matches/leagues/${leagueId}`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("handles errors from API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ message: "Dados inválidos." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpMatchGateway(backendUrl);
    await expect(gateway.finishMatch(leagueId, matchId)).rejects.toThrow(MatchApiError);
  });
});
