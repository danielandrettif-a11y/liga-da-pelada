import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallupRepository } from "./application/manage-callups.js";
import type { GoalRepository } from "../matches/application/register-goal.js";
import { createApp } from "../../presentation/app.js";

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

const leagueId = "00000000-0000-4000-8000-000000000001";
const callupId = "00000000-0000-4000-8000-000000000002";
const playerId = "00000000-0000-4000-8000-000000000003";
const roundId = "00000000-0000-4000-8000-000000000004";

function fixture(enabled: boolean) {
  const callupRepository: CallupRepository = {
    listActive: vi.fn().mockResolvedValue([
      {
        id: callupId,
        league_id: leagueId,
        date: "2026-10-30",
        start_time: "08:00",
        stadium_id: null,
        round_type: "official",
        status: "open",
        is_public: true,
        players_per_team: 6,
        teams_per_round: 4,
        capacity: 24,
        round_id: null,
        created_at: "2026-10-27T10:00:00.000Z",
        entries: [],
      },
    ]),
    listAgenda: vi.fn().mockResolvedValue([
      {
        id: callupId,
        league_id: leagueId,
        date: "2026-10-30",
        start_time: "08:00",
        round_type: "official",
        status: "open",
        round_id: null,
        created_at: "2026-10-27T10:00:00.000Z",
        playersCount: 12,
      },
    ]),
    openCallup: vi.fn().mockResolvedValue({ callupId, roundId }),
    updateCallup: vi.fn().mockResolvedValue(undefined),
    closeCallup: vi.fn().mockResolvedValue(undefined),
    setVisibility: vi.fn().mockResolvedValue(undefined),
    lockCallup: vi.fn().mockResolvedValue(undefined),
    joinCallup: vi.fn().mockResolvedValue({ status: "confirmed", position: 1 }),
    leaveCallup: vi.fn().mockResolvedValue({ roundId: null }),
    addPlayer: vi.fn().mockResolvedValue({ status: "confirmed", position: 2 }),
    removePlayer: vi.fn().mockResolvedValue({ revalidateRoundId: null }),
    inviteGuest: vi.fn().mockResolvedValue({ playerId, status: "confirmed", position: 3 }),
    inviteGuestList: vi.fn().mockResolvedValue({ created: 1, confirmed: 1, waitlisted: 0, failed: [] }),
    createPrelist: vi.fn().mockResolvedValue({ roundId: "00000000-0000-4000-8000-000000000005" }),
    repairMyPlayer: vi.fn().mockResolvedValue({ playerId }),
  };

  const app = createApp({
    goalsEnabled: false,
    callupsEnabled: enabled,
    verifier: { verifyAccessToken: vi.fn().mockResolvedValue({ userId: "user-123" }) },
    repository: {} as GoalRepository,
    callupRepository,
    logger: false,
  });
  apps.push(app);
  return { app, callupRepository };
}

describe("callups presentation", () => {
  it("returns 404 when callups feature flag is disabled", async () => {
    const { app } = fixture(false);
    const response = await app.inject({
      method: "GET",
      url: `/api/callups/leagues/${leagueId}/active`,
    });
    expect(response.statusCode).toBe(404);
  });

  it("lists active callups when flag is enabled", async () => {
    const { app, callupRepository } = fixture(true);
    const response = await app.inject({
      method: "GET",
      url: `/api/callups/leagues/${leagueId}/active`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(callupId);
    expect(callupRepository.listActive).toHaveBeenCalled();
  });

  it("rejects active callup reads without a session", async () => {
    const { app, callupRepository } = fixture(true);
    const response = await app.inject({
      method: "GET",
      url: `/api/callups/leagues/${leagueId}/active`,
    });
    expect(response.statusCode).toBe(401);
    expect(callupRepository.listActive).not.toHaveBeenCalled();
  });

  it("creates a callup with valid bearer token", async () => {
    const { app, callupRepository } = fixture(true);
    const response = await app.inject({
      method: "POST",
      url: `/api/callups/leagues/${leagueId}`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        date: "2026-10-30",
        startTime: "08:00",
        playersPerTeam: 6,
        teamsPerRound: 4,
      },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.callupId).toBe(callupId);
    expect(callupRepository.openCallup).toHaveBeenCalled();
  });

  it("joins a callup with valid bearer token", async () => {
    const { app, callupRepository } = fixture(true);
    const response = await app.inject({
      method: "POST",
      url: `/api/callups/leagues/${leagueId}/${callupId}/join`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.status).toBe("confirmed");
    expect(callupRepository.joinCallup).toHaveBeenCalled();
  });

  it("leaves a callup with valid bearer token", async () => {
    const { app, callupRepository } = fixture(true);
    const response = await app.inject({
      method: "POST",
      url: `/api/callups/leagues/${leagueId}/${callupId}/leave`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(callupRepository.leaveCallup).toHaveBeenCalled();
  });

  it("invites a guest to a callup", async () => {
    const { app, callupRepository } = fixture(true);
    const response = await app.inject({
      method: "POST",
      url: `/api/callups/leagues/${leagueId}/${callupId}/guests`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        name: "Amigo Convidado",
        playerProfile: "midfield",
        isGoalkeeper: false,
      },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.playerId).toBe(playerId);
    expect(callupRepository.inviteGuest).toHaveBeenCalled();
  });

  it("repairs player account", async () => {
    const { app, callupRepository } = fixture(true);
    const response = await app.inject({
      method: "POST",
      url: "/api/callups/repair-player",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.playerId).toBe(playerId);
    expect(callupRepository.repairMyPlayer).toHaveBeenCalled();
  });
});
