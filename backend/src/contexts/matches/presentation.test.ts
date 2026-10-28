import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { UserVerifier } from "../../infrastructure/auth-user-verifier.js";
import { registerMatchRoutes } from "./presentation/matches-route.js";
import type { MatchRepository } from "./application/manage-matches.js";

const leagueId = "00000000-0000-4000-8000-000000000001";
const matchId = "00000000-0000-4000-8000-000000000002";
const roundId = "00000000-0000-4000-8000-000000000003";
const teamAId = "00000000-0000-4000-8000-000000000004";
const teamBId = "00000000-0000-4000-8000-000000000005";
const playerAId = "00000000-0000-4000-8000-000000000006";
const playerBId = "00000000-0000-4000-8000-000000000007";
const eventId = "00000000-0000-4000-8000-000000000008";
const subId = "00000000-0000-4000-8000-000000000009";

const mockVerifier: UserVerifier = {
  verifyAccessToken: vi.fn().mockResolvedValue({ userId: "user-123" }),
};

function createMockRepository(): MatchRepository {
  return {
    getMatch: vi.fn().mockResolvedValue({ id: matchId }),
    findLiveMatchForTeams: vi.fn().mockResolvedValue(matchId),
    getFinishedMatchAudit: vi.fn().mockResolvedValue([]),
    createMatch: vi.fn().mockResolvedValue({ matchId, idempotent: false }),
    finishMatch: vi.fn().mockResolvedValue({ roundId }),
    deleteMatch: vi.fn().mockResolvedValue({ roundId }),
    deleteEvent: vi.fn().mockResolvedValue({ roundId, scoreA: 1, scoreB: 0 }),
    correctFinishedGoal: vi.fn().mockResolvedValue({ roundId, matchId }),
    correctFinishedGoalEvent: vi.fn().mockResolvedValue({ roundId, matchId }),
    addFinishedGoalEvent: vi.fn().mockResolvedValue({ roundId, matchId }),
    changeMatchGoalkeeper: vi.fn().mockResolvedValue({ roundId }),
    setRoundTeamFixedGoalkeeper: vi.fn().mockResolvedValue({ roundId }),
    substituteMatchPlayer: vi.fn().mockResolvedValue({ roundId, substitutionId: subId }),
    undoLastMatchSubstitution: vi.fn().mockResolvedValue({ roundId }),
    updateMatchTimer: vi.fn().mockResolvedValue({ timerStartedAt: "2026-10-30T10:00:00Z" }),
    resetMatchTimer: vi.fn().mockResolvedValue({ eligibilityOffset: 0 }),
    addMatchExtraTime: vi.fn().mockResolvedValue({ newDuration: 480 }),
    notifyMatchTimerThreshold: vi.fn().mockResolvedValue({ sent: true }),
    dispatchMatchTimerThreshold: vi.fn().mockResolvedValue({ sent: true }),
  };
}

function buildApp(repo: MatchRepository) {
  const app = Fastify();
  registerMatchRoutes(app, {
    verifier: mockVerifier,
    repository: repo,
  });
  return app;
}

describe("matches presentation routes", () => {
  it("rejects match reads without a session", async () => {
    const repository = createMockRepository();
    const app = buildApp(repository);
    const res = await app.inject({
      method: "GET",
      url: `/api/matches/leagues/${leagueId}/${matchId}`,
    });
    await app.close();
    expect(res.statusCode).toBe(401);
    expect(repository.getMatch).not.toHaveBeenCalled();
  });

  it("GET /api/matches/leagues/:leagueId/:matchId returns match", async () => {
    const app = buildApp(createMockRepository());
    const res = await app.inject({
      method: "GET",
      url: `/api/matches/leagues/${leagueId}/${matchId}`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(matchId);
  });

  it("GET /api/matches/leagues/:leagueId/live returns live matchId", async () => {
    const app = buildApp(createMockRepository());
    const res = await app.inject({
      method: "GET",
      url: `/api/matches/leagues/${leagueId}/live?roundId=${roundId}&teamAId=${teamAId}&teamBId=${teamBId}`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().matchId).toBe(matchId);
  });

  it("POST /api/matches/leagues/:leagueId creates match", async () => {
    const app = buildApp(createMockRepository());
    const res = await app.inject({
      method: "POST",
      url: `/api/matches/leagues/${leagueId}`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        round_id: roundId,
        team_a_id: teamAId,
        team_b_id: teamBId,
        goalkeeper_a_id: playerAId,
        goalkeeper_b_id: playerBId,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().matchId).toBe(matchId);
  });

  it("POST /api/matches/leagues/:leagueId/:matchId/finish finishes match", async () => {
    const app = buildApp(createMockRepository());
    const res = await app.inject({
      method: "POST",
      url: `/api/matches/leagues/${leagueId}/${matchId}/finish`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().roundId).toBe(roundId);
  });

  it("DELETE /api/matches/leagues/:leagueId/:matchId deletes match", async () => {
    const app = buildApp(createMockRepository());
    const res = await app.inject({
      method: "DELETE",
      url: `/api/matches/leagues/${leagueId}/${matchId}`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().roundId).toBe(roundId);
  });

  it("PATCH /api/matches/leagues/:leagueId/:matchId/timer updates timer", async () => {
    const app = buildApp(createMockRepository());
    const res = await app.inject({
      method: "PATCH",
      url: `/api/matches/leagues/${leagueId}/${matchId}/timer`,
      headers: { authorization: "Bearer valid-token" },
      payload: { action: "start" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().timerStartedAt).toBeDefined();
  });

  it("POST /api/matches/leagues/:leagueId/substitutions creates substitution", async () => {
    const app = buildApp(createMockRepository());
    const res = await app.inject({
      method: "POST",
      url: `/api/matches/leagues/${leagueId}/substitutions`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        match_id: matchId,
        team_id: teamAId,
        player_out_id: playerAId,
        player_in_id: playerBId,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().substitutionId).toBe(subId);
  });

  it("DELETE /api/matches/leagues/:leagueId/:matchId/events/:eventId deletes event", async () => {
    const app = buildApp(createMockRepository());
    const res = await app.inject({
      method: "DELETE",
      url: `/api/matches/leagues/${leagueId}/${matchId}/events/${eventId}`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().scoreA).toBe(1);
  });

  it("POST /api/matches/leagues/:leagueId/events/:eventId/correct-goal removes goal", async () => {
    const app = buildApp(createMockRepository());
    const res = await app.inject({
      method: "POST",
      url: `/api/matches/leagues/${leagueId}/events/${eventId}/correct-goal`,
      headers: { authorization: "Bearer valid-token" },
      payload: { confirmation: "CONFIRMAR" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().roundId).toBe(roundId);
  });

  it("POST /api/matches/leagues/:leagueId/rounds/:roundId/goalkeeper/best returns compatibility response", async () => {
    const app = buildApp(createMockRepository());
    const res = await app.inject({
      method: "POST",
      url: `/api/matches/leagues/${leagueId}/rounds/${roundId}/goalkeeper/best`,
      headers: { authorization: "Bearer valid-token" },
      payload: { playerId: playerAId },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(false);
  });
});
