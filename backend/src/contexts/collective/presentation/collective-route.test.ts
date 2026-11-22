import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { registerCollectiveRoutes } from "./collective-route.js";
import type { CollectiveRepository } from "../application/manage-collective.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";

describe("Collective Routes", () => {
  const createMockRepo = (): CollectiveRepository => ({
    getPreviousCallupId: vi.fn().mockResolvedValue({ callupId: null }),
    getCandidates: vi.fn().mockResolvedValue([]),
    getPage: vi.fn().mockResolvedValue(null),
    sendMessage: vi.fn().mockResolvedValue({ success: true, messageId: "m1" }),
    editMessage: vi.fn().mockResolvedValue({ success: true }),
    deleteMessage: vi.fn().mockResolvedValue({ success: true }),
    markRead: vi.fn().mockResolvedValue({ success: true }),
  });

  const createMockVerifier = (): UserVerifier => ({
    verifyAccessToken: vi.fn().mockResolvedValue({
      userId: "u1",
      email: "test@example.com",
      role: "member",
    }),
  });

  it("reads the page with verified identity and rejects invalid cursors", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    vi.mocked(repo.getPage).mockResolvedValue({ messages: [], has_more: false });
    registerCollectiveRoutes(app, { repository: repo, userVerifier: createMockVerifier() });
    const leagueId = "00000000-0000-0000-0000-000000000001";
    const callupId = "00000000-0000-0000-0000-000000000002";
    const response = await app.inject({ method: "POST", url: `/api/collective/leagues/${leagueId}/page`, headers: { authorization: "Bearer valid-token" }, payload: { callupIds: [callupId], cursor: null, limit: 1 } });
    expect(response.statusCode).toBe(200);
    expect(repo.getPage).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }), leagueId, [callupId], null, 1);
    const bad = await app.inject({ method: "POST", url: `/api/collective/leagues/${leagueId}/page`, headers: { authorization: "Bearer valid-token" }, payload: { callupIds: [callupId], cursor: { createdAt: "bad", id: callupId } } });
    expect(bad.statusCode).toBe(403);
    expect(repo.getPage).toHaveBeenCalledTimes(1);
  });

  it("checks candidates using the verified actor", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCollectiveRoutes(app, { repository: repo, userVerifier: createMockVerifier() });
    const leagueId = "00000000-0000-0000-0000-000000000001";
    const response = await app.inject({ method: "GET", url: `/api/collective/leagues/${leagueId}/candidates`, headers: { authorization: "Bearer valid-token" } });
    expect(response.statusCode).toBe(200);
    expect(repo.getCandidates).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }), leagueId);
  });

  it("rejects previous conversation lookup when the repository denies access", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    vi.mocked(repo.getPreviousCallupId).mockResolvedValueOnce(null);
    registerCollectiveRoutes(app, { repository: repo, userVerifier: createMockVerifier() });
    const leagueId = "00000000-0000-0000-0000-000000000001";
    const response = await app.inject({ method: "GET", url: `/api/collective/leagues/${leagueId}/previous-id`, headers: { authorization: "Bearer valid-token" } });
    expect(response.statusCode).toBe(403);
    expect(repo.getPreviousCallupId).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }), leagueId);
  });

  it("POST /api/collective/leagues/:leagueId/messages sends message", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCollectiveRoutes(app, { repository: repo, userVerifier: createMockVerifier() });

    const res = await app.inject({
      method: "POST",
      url: "/api/collective/leagues/00000000-0000-0000-0000-000000000001/messages",
      headers: { authorization: "Bearer valid-token" },
      payload: { callupId: "00000000-0000-0000-0000-000000000002", body: "Gol da vitória!", kind: "text" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
    expect(repo.sendMessage).toHaveBeenCalled();
  });

  it("PATCH and DELETE messages delegate to repo", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCollectiveRoutes(app, { repository: repo, userVerifier: createMockVerifier() });

    const patchRes = await app.inject({
      method: "PATCH",
      url: "/api/collective/leagues/l1/messages/m1",
      headers: { authorization: "Bearer valid-token" },
      payload: { body: "Texto atualizado" },
    });
    expect(patchRes.statusCode).toBe(200);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: "/api/collective/leagues/l1/messages/m1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(deleteRes.statusCode).toBe(200);
  });
});
