import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { registerManagerRoutes } from "./manager-route.js";
import type { ManagerRepository } from "../application/manage-manager.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";

describe("Manager Routes", () => {
  const createMockRepo = (): ManagerRepository => ({
    createClub: vi.fn().mockResolvedValue({ ok: true, message: "Clube criado com sucesso!" }),
    runCommand: vi.fn().mockResolvedValue({ ok: true, message: "Comando executado!" }),
  });

  const createMockVerifier = (): UserVerifier => ({
    verifyAccessToken: vi.fn().mockResolvedValue({
      userId: "u1",
      email: "test@example.com",
      role: "member",
    }),
  });

  it("POST /api/integrations/manager/club creates club", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerManagerRoutes(app, { repository: repo, userVerifier: createMockVerifier() });

    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/manager/club",
      headers: { authorization: "Bearer valid-token" },
      payload: { identity: { name: "Clube Exemplo", abbreviation: "EXA", color: "#fff" } },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(repo.createClub).toHaveBeenCalled();
  });

  it("POST /api/integrations/manager/command executes command", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerManagerRoutes(app, { repository: repo, userVerifier: createMockVerifier() });

    const res = await app.inject({
      method: "POST",
      url: "/api/integrations/manager/command",
      headers: { authorization: "Bearer valid-token" },
      payload: { command: { type: "open-pack", packId: "p1" }, expectedVersion: 1 },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(repo.runCommand).toHaveBeenCalled();
  });
});
