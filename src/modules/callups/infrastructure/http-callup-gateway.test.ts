import { describe, expect, it, vi } from "vitest";
import { httpCallupGateway } from "./http-callup-gateway";

const backendUrl = "http://backend.local:3001";
const token = "token-123";
const leagueId = "00000000-0000-4000-8000-000000000001";
const callupId = "00000000-0000-4000-8000-000000000002";
const playerId = "00000000-0000-4000-8000-000000000003";

describe("httpCallupGateway", () => {
  it("lists active callups via HTTP GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: callupId, league_id: leagueId, entries: [] }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpCallupGateway(backendUrl, token);
    const result = await gateway.listActive(leagueId);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(callupId);
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/callups/leagues/${leagueId}/active`,
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: `Bearer ${token}` }),
      }),
    );
  });

  it("opens a callup via HTTP POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ callupId }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpCallupGateway(backendUrl, token);
    const result = await gateway.openCallup(leagueId, {
      date: "2026-10-30",
      startTime: "08:00",
      playersPerTeam: 6,
      teamsPerRound: 4,
    });

    expect(result).toEqual({ callupId });
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/callups/leagues/${leagueId}`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        }),
      }),
    );
  });

  it("joins a callup via HTTP POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, status: "confirmed", position: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpCallupGateway(backendUrl, token);
    const result = await gateway.joinCallup(leagueId, callupId);

    expect(result).toEqual({ success: true, status: "confirmed", position: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/callups/leagues/${leagueId}/${callupId}/join`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("leaves a callup via HTTP POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, roundId: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpCallupGateway(backendUrl, token);
    const result = await gateway.leaveCallup(leagueId, callupId);

    expect(result).toEqual({ success: true, roundId: null });
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/callups/leagues/${leagueId}/${callupId}/leave`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("invites guest via HTTP POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, playerId, status: "confirmed", position: 5 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpCallupGateway(backendUrl, token);
    const result = await gateway.inviteGuest(leagueId, callupId, {
      name: "Convidado Teste",
      playerProfile: "midfield",
      isGoalkeeper: false,
    });

    expect(result).toEqual({ success: true, playerId, status: "confirmed", position: 5 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/callups/leagues/${leagueId}/${callupId}/guests`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates prelist via HTTP POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, roundId: "00000000-0000-4000-8000-000000000005" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpCallupGateway(backendUrl, token);
    const result = await gateway.createPrelist(leagueId, callupId);

    expect(result).toEqual({ success: true, roundId: "00000000-0000-4000-8000-000000000005" });
  });

  it("repairs my player via HTTP POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, playerId }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpCallupGateway(backendUrl, token);
    const result = await gateway.repairMyPlayer();

    expect(result).toEqual({ success: true, playerId });
  });
});
