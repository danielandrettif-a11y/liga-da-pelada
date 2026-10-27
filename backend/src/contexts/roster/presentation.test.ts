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
  const app = createApp({
    goalsEnabled: false,
    rosterEnabled: enabled,
    verifier,
    repository: { registerGoal: vi.fn() },
    accountCareerRepository,
    privateBalanceTagRepository,
    fitnessRepository,
    logger: false,
  });
  apps.push(app);
  return { app, verifier, accountCareerRepository, privateBalanceTagRepository, fitnessRepository };
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
});
