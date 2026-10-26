import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { rosterApiFor } from "./roster-api-session";

const originalEnabled = process.env.ROSTER_API_ENABLED;
const originalUrl = process.env.ROSTER_BACKEND_URL;
afterEach(() => {
  if (originalEnabled === undefined) delete process.env.ROSTER_API_ENABLED;
  else process.env.ROSTER_API_ENABLED = originalEnabled;
  if (originalUrl === undefined) delete process.env.ROSTER_BACKEND_URL;
  else process.env.ROSTER_BACKEND_URL = originalUrl;
});

describe("rosterApiFor", () => {
  it("keeps the legacy path while the context is disabled", async () => {
    delete process.env.ROSTER_API_ENABLED;
    const getSession = vi.fn();
    await expect(rosterApiFor({ auth: { getSession } })).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("requires configuration and a valid session", async () => {
    process.env.ROSTER_API_ENABLED = "true";
    delete process.env.ROSTER_BACKEND_URL;
    const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    await expect(rosterApiFor({ auth: { getSession } })).rejects.toThrow("não configurada");
    process.env.ROSTER_BACKEND_URL = "http://backend:3001";
    await expect(rosterApiFor({ auth: { getSession } })).rejects.toThrow("Sessão expirada");
  });

  it("creates the roster gateway from the server session", async () => {
    process.env.ROSTER_API_ENABLED = "true";
    process.env.ROSTER_BACKEND_URL = "http://backend:3001";
    const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: "token" } }, error: null });
    await expect(rosterApiFor({ auth: { getSession } })).resolves.toMatchObject({ getMyAccountCareer: expect.any(Function) });
  });
});
