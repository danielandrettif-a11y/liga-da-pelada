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
  const playerManagementRepository = {
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    swapAvatars: vi.fn().mockResolvedValue(undefined),
    importGuests: vi.fn().mockResolvedValue([]),
  };
  const playerStatisticsRepository = {
    listSeasonTotals: vi.fn().mockResolvedValue([]),
    listLatestOveralls: vi.fn().mockResolvedValue([]),
  };
  const playerProfileRepository = {
    getSaveAccess: vi.fn().mockResolvedValue({ isLeagueAdmin: true, isOwner: false, current: null }),
    saveProfile: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue({ avatarUrl: null, avatarAlternateUrl: null }),
  };
  const playerAvatarStorage = {
    upload: vi.fn(), remove: vi.fn().mockResolvedValue(undefined), pathFromPublicUrl: vi.fn().mockReturnValue(null),
  };
  const rosterRegistrationRepository = {
    listHistory: vi.fn().mockResolvedValue([]),
    listMergeCandidates: vi.fn().mockResolvedValue([]),
    mergePlayers: vi.fn().mockResolvedValue(["00000000-0000-4000-8000-000000000100"]),
  };
  const playerProfilePerformanceRepository = {
    listParticipations: vi.fn().mockResolvedValue([]),
    listGoalEvents: vi.fn().mockResolvedValue([]),
  };
  const playerAwardsRepository = {
    listMonthlyAwards: vi.fn().mockResolvedValue([]),
    listAchievementBelts: vi.fn().mockResolvedValue([]),
    listMonthlyAwardWinners: vi.fn().mockResolvedValue([]),
  };
  const playerHistoryRepository = {
    listRoundHistory: vi.fn().mockResolvedValue([]),
    readAwardHistory: vi.fn().mockResolvedValue({ rounds: [], stats: [] }),
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
    playerManagementRepository,
    playerStatisticsRepository,
    playerProfileRepository,
    playerAvatarStorage,
    rosterRegistrationRepository,
    playerProfilePerformanceRepository,
    playerAwardsRepository,
    playerHistoryRepository,
    logger: false,
  });
  apps.push(app);
  return {
    app, verifier, accountCareerRepository, privateBalanceTagRepository, fitnessRepository,
    speedRatingRepository, rosterActivityRepository, playerCatalogRepository, playerManagementRepository,
    playerStatisticsRepository,
    playerProfileRepository, playerAvatarStorage,
    rosterRegistrationRepository,
    playerProfilePerformanceRepository, playerAwardsRepository, playerHistoryRepository,
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

  it("serves league-scoped player statistics and roster groups", async () => {
    const { app, playerCatalogRepository, playerStatisticsRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const headers = { authorization: "Bearer valid-token" };
    const statistics = await app.inject({
      method: "GET",
      url: `/api/roster/leagues/${leagueId}/player-statistics?round_type=friendly&selectable_only=true`,
      headers,
    });
    const groups = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/roster-groups?round_type=official`, headers,
    });
    expect(statistics.statusCode).toBe(200);
    expect(statistics.json()).toEqual({ players: [] });
    expect(groups.statusCode).toBe(200);
    expect(groups.json()).toEqual({ officialPlayers: [], activeGuests: [], wags: [], supporters: [] });
    expect(playerCatalogRepository.list).toHaveBeenCalledTimes(2);
    expect(playerStatisticsRepository.listSeasonTotals).toHaveBeenCalledWith(
      leagueId, "friendly", { userId: "verified-user" },
    );
    expect(playerStatisticsRepository.listLatestOveralls).toHaveBeenCalledWith(
      leagueId, { userId: "verified-user" },
    );
  });

  it("rejects malformed statistics queries before persistence", async () => {
    const { app, playerStatisticsRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const response = await app.inject({
      method: "GET",
      url: `/api/roster/leagues/${leagueId}/player-statistics?round_type=training`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(400);
    expect(playerStatisticsRepository.listSeasonTotals).not.toHaveBeenCalled();
  });

  it("creates, updates, swaps avatars and imports guests through scoped commands", async () => {
    const { app, playerManagementRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const playerId = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const playerRecord = {
      id: playerId, name: "Convidado", nickname: null, profile_bio: null, avatar_url: "active.jpg",
      avatar_alternate_url: "alternate.jpg", player_profile: "offensive", initial_player_profile: "offensive",
      profile_decision_source: "initial", profile_source_round_id: null, overall_traits: ["offensive"],
      overall_seed_mode: "observed", is_goalkeeper: false, member_category: "guest", is_selectable: true,
      show_fitness_stats: false, registration_source: "admin", profile_scope: "persistent",
      created_by_user_id: null, created_at: "2026-10-20T10:00:00.000Z", league_player_profile: "offensive",
      league_initial_player_profile: "offensive", league_overall_traits: ["offensive"],
      league_overall_seed_mode: "observed",
    };
    playerManagementRepository.create.mockResolvedValue(playerRecord);
    playerManagementRepository.update.mockResolvedValue({ ...playerRecord, nickname: "BQ" });
    playerManagementRepository.importGuests.mockResolvedValue([{
      createdName: "Ana", playerId, addedToCallup: true,
    }]);

    const created = await app.inject({
      method: "POST", url: `/api/roster/leagues/${leagueId}/players`, headers,
      payload: { name: "Convidado", member_category: "guest", player_profile: "offensive" },
    });
    const updated = await app.inject({
      method: "PATCH", url: `/api/roster/leagues/${leagueId}/players/${playerId}`, headers,
      payload: { nickname: "BQ" },
    });
    const swapped = await app.inject({
      method: "POST", url: `/api/roster/leagues/${leagueId}/players/${playerId}/swap-avatars`, headers,
    });
    const imported = await app.inject({
      method: "POST", url: `/api/roster/leagues/${leagueId}/guest-imports`, headers,
      payload: { names: ["Ana"] },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ player: { id: playerId, member_category: "guest" } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ player: { nickname: "BQ" } });
    expect(swapped.statusCode).toBe(204);
    expect(imported.statusCode).toBe(201);
    expect(imported.json()).toMatchObject({ createdCount: 1 });
    expect(playerManagementRepository.swapAvatars).toHaveBeenCalledWith(
      leagueId, playerId, { userId: "verified-user" },
    );
  });

  it("rejects malformed player commands before persistence", async () => {
    const { app, playerManagementRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const response = await app.inject({
      method: "POST", url: `/api/roster/leagues/${leagueId}/players`,
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Ana", member_category: "player" },
    });
    expect(response.statusCode).toBe(400);
    expect(playerManagementRepository.create).not.toHaveBeenCalled();
  });

  it("saves multipart player profiles and deletes through authenticated scoped routes", async () => {
    const { app, playerProfileRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const playerId = "00000000-0000-4000-8000-000000000001";
    const boundary = "player-profile-boundary";
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nConvidado\r\n`
      + `--${boundary}\r\nContent-Disposition: form-data; name="member_category"\r\n\r\nguest\r\n`
      + `--${boundary}--\r\n`,
    );
    const headers = {
      authorization: "Bearer valid-token", "content-type": `multipart/form-data; boundary=${boundary}`,
    };
    const saved = await app.inject({
      method: "POST", url: `/api/roster/leagues/${leagueId}/player-profiles`, headers, payload,
    });
    const createdId = saved.json().playerId;
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/roster/leagues/${leagueId}/players/${playerId}`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(saved.statusCode).toBe(201);
    expect(createdId).toMatch(/^[0-9a-f-]{36}$/);
    expect(deleted.statusCode).toBe(204);
    expect(playerProfileRepository.saveProfile).toHaveBeenCalledWith(
      leagueId, expect.objectContaining({ playerId: createdId, name: "Convidado", memberCategory: "guest" }),
      true, { userId: "verified-user" },
    );
    expect(playerProfileRepository.delete).toHaveBeenCalledWith(
      leagueId, playerId, { userId: "verified-user" },
    );
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

  it("returns league-scoped player playtime and club goals", async () => {
    const { app, playerProfilePerformanceRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const playerId = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const playtime = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/players/${playerId}/playtime`, headers,
    });
    const goals = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/players/${playerId}/club-goals`, headers,
    });
    expect(playtime.statusCode).toBe(200);
    expect(playtime.json()).toEqual({
      playtime: { totalSeconds: 0, officialSeconds: 0, friendlySeconds: 0 },
    });
    expect(goals.statusCode).toBe(200);
    expect(goals.json()).toEqual({ clubs: [] });
    expect(playerProfilePerformanceRepository.listParticipations)
      .toHaveBeenCalledWith(leagueId, playerId, { userId: "verified-user" });
    expect(playerProfilePerformanceRepository.listGoalEvents)
      .toHaveBeenCalledWith(leagueId, playerId, { userId: "verified-user" });
  });

  it("returns league-scoped player awards and monthly winners", async () => {
    const { app, playerAwardsRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const playerId = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const monthly = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/players/${playerId}/monthly-awards`, headers,
    });
    const belts = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/players/${playerId}/achievement-belts`, headers,
    });
    const winners = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/monthly-awards/winners?period_start=2026-09-01`, headers,
    });
    expect(monthly.json()).toEqual({ awards: [] });
    expect(belts.json()).toEqual({ belts: [] });
    expect(winners.json()).toEqual({ winners: [] });
    expect(playerAwardsRepository.listMonthlyAwards).toHaveBeenCalledWith(leagueId, playerId, { userId: "verified-user" });
    expect(playerAwardsRepository.listAchievementBelts).toHaveBeenCalledWith(leagueId, playerId, { userId: "verified-user" });
    expect(playerAwardsRepository.listMonthlyAwardWinners)
      .toHaveBeenCalledWith(leagueId, "2026-09-01", { userId: "verified-user" });
  });

  it("returns round history and seasonal awards for a league player", async () => {
    const { app, playerHistoryRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const playerId = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const history = await app.inject({ method: "GET",
      url: `/api/roster/leagues/${leagueId}/players/${playerId}/round-history?round_type=friendly`, headers });
    const awards = await app.inject({ method: "GET",
      url: `/api/roster/leagues/${leagueId}/players/${playerId}/award-seasons`, headers });
    expect(history.json()).toEqual({ history: [] });
    expect(awards.json()).toEqual({ seasons: [] });
    expect(playerHistoryRepository.listRoundHistory)
      .toHaveBeenCalledWith(leagueId, playerId, "friendly", { userId: "verified-user" });
    expect(playerHistoryRepository.readAwardHistory).toHaveBeenCalledWith(leagueId, { userId: "verified-user" });
  });

  it("handles registration history, merge candidates and profile merge routes", async () => {
    const { app, rosterRegistrationRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const guestId = "00000000-0000-4000-8000-000000000001";
    const registeredId = "00000000-0000-4000-8000-000000000002";
    const headers = { authorization: "Bearer valid-token" };

    const history = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/registrations`, headers,
    });
    const candidates = await app.inject({
      method: "GET", url: `/api/roster/leagues/${leagueId}/players/${guestId}/merge-candidates`, headers,
    });
    const merge = await app.inject({
      method: "POST",
      url: `/api/roster/leagues/${leagueId}/players/${guestId}/merge`,
      headers,
      payload: { registeredPlayerId: registeredId },
    });

    expect(history.json()).toEqual({ events: [] });
    expect(candidates.json()).toEqual({ players: [] });
    expect(merge.json()).toEqual({
      success: true,
      playerId: guestId,
      affectedRoundIds: ["00000000-0000-4000-8000-000000000100"],
    });
    expect(rosterRegistrationRepository.listHistory)
      .toHaveBeenCalledWith(leagueId, { userId: "verified-user" });
    expect(rosterRegistrationRepository.listMergeCandidates)
      .toHaveBeenCalledWith(leagueId, guestId, { userId: "verified-user" });
    expect(rosterRegistrationRepository.mergePlayers)
      .toHaveBeenCalledWith(leagueId, guestId, registeredId, { userId: "verified-user" });
  });
});
