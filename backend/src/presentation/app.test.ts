import { afterEach, describe, expect, it, vi } from "vitest";
import type { GoalRepository } from "../contexts/matches/application/register-goal.js";
import type { UserVerifier } from "../infrastructure/auth-user-verifier.js";
import { createApp } from "./app.js";

const matchId = "00000000-0000-4000-8000-000000000001";
const goal = {
  player_id: "00000000-0000-4000-8000-000000000002",
  team_id: "00000000-0000-4000-8000-000000000003",
  idempotency_key: "request-1",
};
const receipt = {
  event_id: "00000000-0000-4000-8000-000000000004",
  idempotent: false,
  score_a: 1,
  score_b: 0,
  round_id: "00000000-0000-4000-8000-000000000005",
};
const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function fixture(enabled: boolean, actor: { userId: string } | null = { userId: "server-verified-user" }) {
  const verifier: UserVerifier = { verifyAccessToken: vi.fn().mockResolvedValue(actor) };
  const repository: GoalRepository = { registerGoal: vi.fn().mockResolvedValue(receipt) };
  const app = createApp({ goalsEnabled: enabled, verifier, repository, logger: false });
  apps.push(app);
  return { app, verifier, repository };
}

describe("goal HTTP route", () => {
  it("fails fast when matches are enabled without their repository", () => {
    expect(() => createApp({
      goalsEnabled: false,
      matchesEnabled: true,
      verifier: { verifyAccessToken: vi.fn() },
      repository: {} as GoalRepository,
      logger: false,
    })).toThrow("MatchRepository e MatchTimerScheduler são obrigatórios");
  });

  it("is absent by default", async () => {
    const { app } = fixture(false);
    const result = await app.inject({ method: "POST", url: `/api/matches/${matchId}/goals`, payload: goal });
    expect(result.statusCode).toBe(404);
  });

  it("uses the verified bearer token identity", async () => {
    const { app, verifier, repository } = fixture(true);
    const result = await app.inject({
      method: "POST", url: `/api/matches/${matchId}/goals`,
      headers: { authorization: "Bearer valid-token" }, payload: goal,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual(receipt);
    expect(verifier.verifyAccessToken).toHaveBeenCalledWith("valid-token");
    expect(repository.registerGoal).toHaveBeenCalledWith(
      expect.objectContaining({ matchId, playerId: goal.player_id, idempotencyKey: goal.idempotency_key }),
      { userId: "server-verified-user" },
    );
  });

  it("rejects missing credentials, invalid credentials and malformed input", async () => {
    const { app, repository } = fixture(true, null);
    const unauthenticated = await app.inject({ method: "POST", url: `/api/matches/${matchId}/goals`, payload: goal });
    expect(unauthenticated.statusCode).toBe(401);
    const invalid = await app.inject({
      method: "POST", url: `/api/matches/${matchId}/goals`,
      headers: { authorization: "Bearer expired" }, payload: goal,
    });
    expect(invalid.statusCode).toBe(401);
    const malformed = await app.inject({
      method: "POST", url: `/api/matches/${matchId}/goals`,
      headers: { authorization: "Bearer expired" }, payload: { ...goal, minute: -1 },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ code: "INVALID_REQUEST", message: "Dados da requisição inválidos." });
    expect(repository.registerGoal).not.toHaveBeenCalled();
  });

  it("preserves client HTTP errors instead of reporting service unavailability", async () => {
    const { app } = fixture(true);
    const result = await app.inject({
      method: "POST",
      url: `/api/matches/${matchId}/goals`,
      headers: { "content-type": "application/xml" },
      payload: "<goal />",
    });
    expect(result.statusCode).toBe(415);
    expect(result.json()).toEqual({
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Formato da requisição não suportado.",
    });
  });
});
