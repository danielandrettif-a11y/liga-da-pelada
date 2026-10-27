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
  const app = createApp({
    goalsEnabled: false,
    rosterEnabled: enabled,
    verifier,
    repository: { registerGoal: vi.fn() },
    accountCareerRepository,
    privateBalanceTagRepository,
    logger: false,
  });
  apps.push(app);
  return { app, verifier, accountCareerRepository, privateBalanceTagRepository };
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
});
