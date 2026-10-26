import { afterEach, describe, expect, it, vi } from "vitest";
import type { GoalRepository } from "../matches/application/register-goal.js";
import type { AccountAccessRepository } from "./application/manage-account-access.js";
import { createApp } from "../../presentation/app.js";

const userId = "00000000-0000-4000-8000-000000000001";
const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function fixture(enabled: boolean, actor: { userId: string } | null = { userId: "verified-user" }) {
  const accountAccessRepository: AccountAccessRepository = {
    list: vi.fn().mockResolvedValue([{
      userId, role: "player", createdAt: "2026-01-01T00:00:00.000Z", player: null,
    }]),
    setRole: vi.fn().mockResolvedValue("admin"),
  };
  const verifier = { verifyAccessToken: vi.fn().mockResolvedValue(actor) };
  const repository: GoalRepository = { registerGoal: vi.fn() };
  const app = createApp({
    goalsEnabled: false,
    identityEnabled: enabled,
    verifier,
    repository,
    accountAccessRepository,
    logger: false,
  });
  apps.push(app);
  return { app, verifier, accountAccessRepository };
}

describe("identity account access HTTP routes", () => {
  it("are absent while the identity flag is disabled", async () => {
    const { app } = fixture(false);
    expect((await app.inject({ method: "GET", url: "/api/identity/accounts" })).statusCode).toBe(404);
  });

  it("lists accounts and changes roles using the verified identity", async () => {
    const { app, verifier, accountAccessRepository } = fixture(true);
    const headers = { authorization: "Bearer valid-token" };
    const listed = await app.inject({ method: "GET", url: "/api/identity/accounts", headers });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({ accounts: [{
      userId, role: "player", createdAt: "2026-01-01T00:00:00.000Z", player: null,
    }] });

    const changed = await app.inject({
      method: "PATCH", url: `/api/identity/accounts/${userId}/role`, headers, payload: { admin: true },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toEqual({ role: "admin" });
    expect(verifier.verifyAccessToken).toHaveBeenCalledWith("valid-token");
    expect(accountAccessRepository.setRole).toHaveBeenCalledWith(userId, "admin", { userId: "verified-user" });
  });

  it("rejects missing credentials and malformed payloads", async () => {
    const { app, accountAccessRepository } = fixture(true, null);
    expect((await app.inject({ method: "GET", url: "/api/identity/accounts" })).statusCode).toBe(401);
    const malformed = await app.inject({
      method: "PATCH",
      url: `/api/identity/accounts/${userId}/role`,
      headers: { authorization: "Bearer invalid" },
      payload: { admin: "yes" },
    });
    expect(malformed.statusCode).toBe(400);
    expect(accountAccessRepository.setRole).not.toHaveBeenCalled();
  });
});
