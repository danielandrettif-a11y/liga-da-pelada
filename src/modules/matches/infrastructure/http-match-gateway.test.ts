import { describe, expect, it, vi } from "vitest";
import {
  dispatchSystemMatchTimerThreshold,
  httpMatchGateway,
  MatchApiError,
  releaseSystemMatchTimerThreshold,
} from "./http-match-gateway";

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

  it("sends the canonical correction, goalkeeper and substitution contracts", async () => {
    const eventId = "00000000-0000-4000-8000-000000000006";
    const playerAId = "00000000-0000-4000-8000-000000000007";
    const playerBId = "00000000-0000-4000-8000-000000000008";
    const teamId = "00000000-0000-4000-8000-000000000009";
    const substitutionId = "00000000-0000-4000-8000-000000000010";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ roundId, matchId, substitutionId }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = httpMatchGateway(backendUrl, "test-token");

    await gateway.correctFinishedGoalEvent(leagueId, eventId, playerAId, playerBId, "CONFIRMAR");
    await gateway.addFinishedGoalEvent(leagueId, matchId, teamId, playerAId, null, "CONFIRMAR");
    await gateway.changeMatchGoalkeeper(leagueId, matchId, teamId, playerAId, 30);
    await gateway.setRoundTeamFixedGoalkeeper(leagueId, roundId, teamId, playerAId);
    await gateway.substituteMatchPlayer(leagueId, {
      match_id: matchId,
      team_id: teamId,
      player_out_id: playerAId,
      player_in_id: playerBId,
      reason: "other",
    });
    await gateway.undoLastMatchSubstitution(leagueId, matchId, substitutionId);

    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/matches/leagues/${leagueId}/events/${eventId}/correct-goal-event`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ playerId: playerAId, assistPlayerId: playerBId, confirmation: "CONFIRMAR" }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/matches/leagues/${leagueId}/substitutions`,
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"reason":"other"') }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/matches/leagues/${leagueId}/${matchId}/substitutions/${substitutionId}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("claims and releases timer notifications through user and system boundaries", async () => {
    const claimedAt = "2026-10-29T10:00:00.000Z";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ claimedAt, secondsLeft: 30 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = httpMatchGateway(backendUrl, "test-token");

    await gateway.notifyMatchTimerThreshold(leagueId, matchId, "thirty_seconds");
    await gateway.releaseMatchTimerThreshold(leagueId, matchId, "thirty_seconds", claimedAt);
    await dispatchSystemMatchTimerThreshold(backendUrl, "webhook-secret", matchId, "finished");
    await releaseSystemMatchTimerThreshold(backendUrl, "webhook-secret", matchId, "finished", claimedAt);

    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/matches/leagues/${leagueId}/${matchId}/timer/notify`,
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ threshold: "thirty_seconds", claimedAt }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/internal/matches/${matchId}/timer/dispatch`,
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer webhook-secret" }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/api/internal/matches/${matchId}/timer/dispatch`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
