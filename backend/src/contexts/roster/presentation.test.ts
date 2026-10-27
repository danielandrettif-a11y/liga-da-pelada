import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../presentation/app.js";

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function fixture(enabled: boolean) {
  const verifier = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: "verified-user" }) };
  const accountCareerRepository = { listForAccount: vi.fn().mockResolvedValue([]) };
  const privateBalanceTagRepository = {
    get: vi.fn().mockResolvedValue({ allowed: true, tag: "bagre_1" as const }),
    set: vi.fn().mockResolvedValue(undefined),
  };
  const fitnessRepository = {
    listMyRounds: vi.fn().mockResolvedValue([]),
    saveMyFitness: vi.fn().mockResolvedValue("00000000-0000-4000-8000-000000000001"),
    setMyVisibility: vi.fn().mockResolvedValue("00000000-0000-4000-8000-000000000001"),
    listSummaryMeasurements: vi.fn().mockResolvedValue([]),
  };
  const speedRatingRepository = {
    listRatings: vi.fn().mockResolvedValue({ "00000000-0000-4000-8000-000000000001": 3 as const }),
    listEligiblePlayers: vi.fn().mockResolvedValue([
      { id: "00000000-0000-4000-8000-000000000001", speedRating: 3 as const },
      { id: "00000000-0000-4000-8000-000000000002", speedRating: 1 as const },
    ]),
    setRating: vi.fn().mockResolvedValue(undefined),
  };
  const rosterActivityRepository = {
    getUnreadState: vi.fn().mockResolvedValue({ count: 2, lastSeenAt: "2026-10-20T10:00:00.000Z" }),
    listUnreadEvents: vi.fn().mockResolvedValue([
      { playerId: "00000000-0000-4000-8000-000000000001", createdAt: "2026-10-20T10:01:00.000Z" },
    ]),
    markSeenThrough: vi.fn().mockResolvedValue(undefined),
    markSeen: vi.fn().mockResolvedValue(undefined),
  };
  const playerCatalogRepository = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
  };
  const rosterRegistrationRepository = {
    listHistory: vi.fn().mockResolvedValue([]),
    listMergeCandidates: vi.fn().mockResolvedValue([]),
  };
  const app = createApp({
    goalsEnabled: false,
    rosterEnabled: enabled,
    verifier,
    repository: { registerGoal: vi.fn() },
    accountCareerRepository,
    privateBalanceTagRepository,
    fitnessRepository,
    speedRatingRepository,
    rosterActivityRepository,
    playerCatalogRepository,
    rosterRegistrationRepository,
    logger: false,
  });
  apps.push(app);
  return {
    app, verifier, accountCareerRepository, privateBalanceTagRepository, fitnessRepository,
    speedRatingRepository, rosterActivityRepository, playerCatalogRepository, rosterRegistrationRepository,
  };
}

describe("roster HTTP routes", () => {
  it("keeps the context absent while its feature flag is disabled", async () => {
    expect((await fixture(false).app.inject({ method: "GET", url: "/api/roster/me/career" })).statusCode).toBe(404);
  });

  it("requires a verified bearer token", async () => {
    const { app, verifier, accountCareerRepository } = fixture(true);
    const response = await app.inject({ method: "GET", url: "/api/roster/me/career" });
    expect(response.statusCode).toBe(401);
    expect(verifier.verifyAccessToken).not.toHaveBeenCalled();
    expect(accountCareerRepository.listForAccount).not.toHaveBeenCalled();
  });

  it("returns the career projection for the verified account", async () => {
    const { app, accountCareerRepository } = fixture(true);
    const response = await app.inject({
      method: "GET", url: "/api/roster/me/career", headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ rows: [], overall: { goals: 0 }, official: { goals: 0 }, friendly: { goals: 0 } });
    expect(accountCareerRepository.listForAccount).toHaveBeenCalledWith({ userId: "verified-user" });
  });

  it("reads and updates a private balance tag through the verified actor", async () => {
    const { app, privateBalanceTagRepository } = fixture(true);
    const playerId = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const read = await app.inject({ method: "GET", url: `/api/roster/players/${playerId}/private-balance-tag`, headers });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ allowed: true, tag: "bagre_1" });
    const update = await app.inject({
      method: "PUT", url: `/api/roster/players/${playerId}/private-balance-tag`, headers, payload: { tag: "craque_2" },
    });
    expect(update.statusCode).toBe(204);
    expect(privateBalanceTagRepository.set).toHaveBeenCalledWith(playerId, "craque_2", { userId: "verified-user" });
  });

  it("rejects malformed private tag requests before persistence", async () => {
    const { app, privateBalanceTagRepository } = fixture(true);
    const response = await app.inject({
      method: "PUT",
      url: "/api/roster/players/00000000-0000-4000-8000-000000000001/private-balance-tag",
      headers: { authorization: "Bearer valid-token" },
      payload: { tag: "elite" },
    });
    expect(response.statusCode).toBe(400);
    expect(privateBalanceTagRepository.set).not.toHaveBeenCalled();
  });

  it("serves owner fitness reads, writes and visibility through verified claims", async () => {
    const { app, fitnessRepository } = fixture(true);
    const playerId = "00000000-0000-4000-8000-000000000001";
    const leagueId = "00000000-0000-4000-8000-000000000002";
    const roundId = "00000000-0000-4000-8000-000000000003";
    const headers = { authorization: "Bearer valid-token" };
    const rounds = await app.inject({
      method: "GET", url: `/api/roster/players/${playerId}/fitness-rounds?league_id=${leagueId}`, headers,
    });
    const summary = await app.inject({
      method: "GET", url: `/api/roster/players/${playerId}/fitness-summary?league_id=${leagueId}`, headers,
    });
    const save = await app.inject({
      method: "PUT", url: `/api/roster/rounds/${roundId}/my-fitness`, headers,
      payload: { distance: 5.5, pace: 100 },
    });
    const visibility = await app.inject({
      method: "PATCH", url: "/api/roster/me/fitness-visibility", headers, payload: { visible: true },
    });
    expect(rounds.statusCode).toBe(200);
    expect(summary.statusCode).toBe(200);
    expect(save.statusCode).toBe(200);
    expect(visibility.statusCode).toBe(200);
    expect(fitnessRepository.listMyRounds).toHaveBeenCalledWith(playerId, leagueId, { userId: "verified-user" });
    expect(fitnessRepository.saveMyFitness).toHaveBeenCalledWith(roundId, 5.5, 6, { userId: "verified-user" });
  });

  it("reads, updates and uses league-scoped speed ratings through a verified actor", async () => {
    const { app, speedRatingRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const first = "00000000-0000-4000-8000-000000000001";
    const second = "00000000-0000-4000-8000-000000000002";
    const headers = { authorization: "Bearer valid-token" };
    const ratings = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/speed-ratings`, headers,
    });
    const update = await app.inject({
      method: "PUT", url: `/api/roster/leagues/${leagueId}/players/${first}/speed-rating`, headers,
      payload: { rating: 2 },
    });
    const draw = await app.inject({
      method: "POST", url: `/api/roster/leagues/${leagueId}/speed-draw`, headers,
      payload: { playerIds: [first, second], teamCount: 2, playersPerTeam: 1 },
    });
    expect(ratings.statusCode).toBe(200);
    expect(update.statusCode).toBe(204);
    expect(draw.statusCode).toBe(200);
    expect(draw.json()).toMatchObject({ teams: expect.arrayContaining([[first], [second]]), unratedCount: 0 });
    expect(speedRatingRepository.setRating).toHaveBeenCalledWith(leagueId, first, 2, { userId: "verified-user" });
  });

  it("reads and advances the league-scoped roster activity marker", async () => {
    const { app, rosterActivityRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const headers = { authorization: "Bearer valid-token" };
    const state = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/activity/unread-state`, headers,
    });
    const players = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/activity/unread-players`, headers,
    });
    const through = await app.inject({
      method: "PUT", url: `/api/roster/leagues/${leagueId}/activity/read-through`, headers,
      payload: { seenThrough: "2026-10-20T10:01:00.000Z" },
    });
    const all = await app.inject({
      method: "PUT", url: `/api/roster/leagues/${leagueId}/activity/read`, headers,
    });
    expect(state.statusCode).toBe(200);
    expect(state.json()).toMatchObject({ count: 2 });
    expect(players.json()).toMatchObject({
      playerIds: ["00000000-0000-4000-8000-000000000001"],
    });
    expect(through.statusCode).toBe(204);
    expect(all.statusCode).toBe(204);
    expect(rosterActivityRepository.markSeen).toHaveBeenCalledWith(leagueId, { userId: "verified-user" });
  });

  it("lists and reads the league-scoped player catalog", async () => {
    const { app, playerCatalogRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const playerId = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const list = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/players?selectable_only=true`, headers,
    });
    const detail = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/players/${playerId}`, headers,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ players: [] });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual({ player: null });
    expect(playerCatalogRepository.list).toHaveBeenCalledWith(leagueId, { userId: "verified-user" });
    expect(playerCatalogRepository.get).toHaveBeenCalledWith(leagueId, playerId, { userId: "verified-user" });
  });

  it("lists league registration history and merge candidates for verified admins", async () => {
    const { app, rosterRegistrationRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const guestId = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const history = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/registrations`, headers,
    });
    const candidates = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/players/${guestId}/merge-candidates`, headers,
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toEqual({ events: [] });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json()).toEqual({ players: [] });
    expect(rosterRegistrationRepository.listHistory).toHaveBeenCalledWith(leagueId, { userId: "verified-user" });
    expect(rosterRegistrationRepository.listMergeCandidates)
      .toHaveBeenCalledWith(leagueId, guestId, { userId: "verified-user" });
  });
});
