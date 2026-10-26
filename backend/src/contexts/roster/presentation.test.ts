import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../presentation/app.js";

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function fixture(enabled: boolean) {
  const verifier = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: "verified-user" }) };
  const accountCareerRepository = { listForAccount: vi.fn().mockResolvedValue([]) };
  const app = createApp({
    goalsEnabled: false,
    rosterEnabled: enabled,
    verifier,
    repository: { registerGoal: vi.fn() },
    accountCareerRepository,
    logger: false,
  });
  apps.push(app);
  return { app, verifier, accountCareerRepository };
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
});
