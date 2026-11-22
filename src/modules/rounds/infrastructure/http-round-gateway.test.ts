import { describe, expect, it, vi } from "vitest";
import { httpRoundGateway, RoundApiError } from "./http-round-gateway";

const backendUrl = "https://backend.example.com";
const leagueId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const teamId = "00000000-0000-4000-8000-000000000003";
const draftId = "00000000-0000-4000-8000-000000000004";
const playerId = "00000000-0000-4000-8000-000000000005";
const callupId = "00000000-0000-4000-8000-000000000006";

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

  it("returns effective prelist metadata needed by post-commit reminders", async () => {
    const payload = {
      roundId,
      effectiveDate: "2026-10-30",
      effectiveStartTime: "20:00",
      effectiveRoundType: "official",
      created: true,
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(payload) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await httpRoundGateway(backendUrl, "test-token").saveRoundPrelist(leagueId, {
      date: "2026-10-30",
      startTime: "20:00",
      roundType: "official",
      playerIds: [],
    });

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/prelist`,
      expect.objectContaining({ method: "POST" }),
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

  it("finishes a round with the financial contract and returns post-commit effects", async () => {
    const payload = { archived: false, shouldRefreshOverall: true };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(payload) });
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      paymentPix: "pix@example.com",
      paymentTotal: 120,
      recipientId: null,
      expenseItemIds: ["00000000-0000-4000-8000-000000000010"],
    };
    await expect(httpRoundGateway(backendUrl, "test-token").finishRound(leagueId, roundId, input))
      .resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/${roundId}/finish`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });

  it("requests the preset offset for the selected round type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ offset: 3 }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpRoundGateway(backendUrl, "test-token").getNextTeamPresetOffset(leagueId, "friendly"))
      .resolves.toEqual({ offset: 3 });
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/next-team-preset-offset?roundType=friendly`,
      expect.anything(),
    );
  });

  it("sends the outgoing player when opening a replacement vacancy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await httpRoundGateway(backendUrl, "test-token").openCallupReplacementVacancy(leagueId, roundId, playerId);

    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/${roundId}/replacement-vacancy`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ outPlayerId: playerId }),
      }),
    );
  });

  it("sends complete round correction payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = httpRoundGateway(backendUrl, "test-token");
    const targetPlayerId = "00000000-0000-4000-8000-000000000007";

    await gateway.transferRoundPlayerIdentity(leagueId, roundId, playerId, targetPlayerId);
    await gateway.zeroPlayerRoundPoints(leagueId, roundId, playerId, "ausência confirmada");
    await gateway.addRoundEmergencySubstitute(leagueId, roundId, {
      outPlayerId: playerId,
      inPlayerId: targetPlayerId,
      teamId,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/${roundId}/transfer-player-identity`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sourcePlayerId: playerId, targetPlayerId }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/${roundId}/players/${playerId}/zero-points`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "ausência confirmada" }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/${roundId}/emergency-substitute`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ outPlayerId: playerId, inPlayerId: targetPlayerId, teamId }),
      }),
    );
  });

  it("reads the draft workspace by callup identity", async () => {
    const workspace = { id: draftId, callupId, roundId, players: [], captains: [] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(workspace) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpRoundGateway(backendUrl, "test-token").getDraftWorkspace(leagueId, callupId))
      .resolves.toEqual(workspace);
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/callups/${callupId}/draft-workspace`,
      expect.anything(),
    );
  });

  it("sends canonical draft mutation payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ roundId }) });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = httpRoundGateway(backendUrl, "test-token");

    await gateway.makeTeamDraftPick(leagueId, draftId, playerId);
    await gateway.replaceTeamDraftCaptain(leagueId, draftId, 2, playerId);
    await gateway.applyDraftSwap(leagueId, draftId, playerId, roundId);
    await expect(gateway.finalizeTeamDraft(leagueId, draftId)).resolves.toEqual({ roundId });

    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/drafts/${draftId}/pick`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ playerId }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/drafts/${draftId}/replace-captain`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ teamSlot: 2, newCaptainId: playerId }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/drafts/${draftId}/swap`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ playerAId: playerId, playerBId: roundId }) }),
    );
  });

  it("sends the complete adaptive draw contract", async () => {
    const result = { success: true, teams: [[playerId], [roundId]], balanceScore: 100 };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(result) });
    vi.stubGlobal("fetch", fetchMock);
    const input = { playerIds: [playerId, roundId], attendanceOrder: [playerId], teamCount: 2, playersPerTeam: 1 };

    await expect(httpRoundGateway(backendUrl, "test-token").drawTeamsAdaptiveOnServer(leagueId, input))
      .resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/rounds/leagues/${leagueId}/adaptive-draw`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });
});
