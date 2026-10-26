import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { leagueApiFor } from "./league-api-session";

const originalEnabled = process.env.LEAGUE_API_ENABLED;
const originalUrl = process.env.LEAGUE_BACKEND_URL;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.LEAGUE_API_ENABLED;
  else process.env.LEAGUE_API_ENABLED = originalEnabled;
  if (originalUrl === undefined) delete process.env.LEAGUE_BACKEND_URL;
  else process.env.LEAGUE_BACKEND_URL = originalUrl;
});

describe("leagueApiFor", () => {
  it("keeps the legacy path when the feature flag is disabled", async () => {
    delete process.env.LEAGUE_API_ENABLED;
    const getSession = vi.fn();
    await expect(leagueApiFor({ auth: { getSession } })).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("requires a server URL and a valid session when enabled", async () => {
    process.env.LEAGUE_API_ENABLED = "true";
    delete process.env.LEAGUE_BACKEND_URL;
    const getSession = vi.fn();
    await expect(leagueApiFor({ auth: { getSession } })).rejects.toThrow("não configurada");

    process.env.LEAGUE_BACKEND_URL = "http://backend:3001";
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(leagueApiFor({ auth: { getSession } })).rejects.toThrow("Sessão expirada");
  });

  it("creates the HTTP adapter with a verified server session", async () => {
    process.env.LEAGUE_API_ENABLED = "true";
    process.env.LEAGUE_BACKEND_URL = "http://backend:3001";
    const getSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: "verified-token" } }, error: null,
    });
    await expect(leagueApiFor({ auth: { getSession } })).resolves.toMatchObject({
      create: expect.any(Function), joinOpen: expect.any(Function), setVisibility: expect.any(Function),
    });
  });
});
