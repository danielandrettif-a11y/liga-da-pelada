import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { roundApiFor } from "./round-api-session";

const originalEnabled = process.env.ROUNDS_API_ENABLED;
const originalUrl = process.env.ROUNDS_BACKEND_URL;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.ROUNDS_API_ENABLED;
  else process.env.ROUNDS_API_ENABLED = originalEnabled;
  if (originalUrl === undefined) delete process.env.ROUNDS_BACKEND_URL;
  else process.env.ROUNDS_BACKEND_URL = originalUrl;
});

describe("roundApiFor", () => {
  it("keeps the legacy path when the feature flag is disabled", async () => {
    delete process.env.ROUNDS_API_ENABLED;
    const getSession = vi.fn();
    await expect(roundApiFor({ auth: { getSession } })).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("requires a server URL when enabled", async () => {
    process.env.ROUNDS_API_ENABLED = "true";
    delete process.env.ROUNDS_BACKEND_URL;
    const getSession = vi.fn();
    await expect(roundApiFor({ auth: { getSession } })).rejects.toThrow("não configurada");
  });

  it("creates the HTTP adapter with a verified server session", async () => {
    process.env.ROUNDS_API_ENABLED = "true";
    process.env.ROUNDS_BACKEND_URL = "http://backend:3001";
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    await expect(roundApiFor({ auth: { getSession } })).resolves.toMatchObject({
      getRounds: expect.any(Function),
      getRound: expect.any(Function),
      createRoundWithTeams: expect.any(Function),
      deleteRound: expect.any(Function),
    });
  });
});
