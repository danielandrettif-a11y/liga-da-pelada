import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { registerCollectiveRoutes } from "./collective-route.js";
import type { CollectiveRepository } from "../application/manage-collective.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";

describe("Collective Routes", () => {
  const createMockRepo = (): CollectiveRepository => ({
    getActiveSummary: vi.fn().mockResolvedValue({
      callupId: "c1",
      roundId: "r1",
      roundNumber: 1,
      date: "2026-10-30",
      status: "in_progress",
      unreadCount: 0,
    }),
    getRoom: vi.fn().mockResolvedValue({
      summary: { callupId: "c1", roundId: "r1", roundNumber: 1, date: "2026-10-30", status: "in_progress", unreadCount: 0 },
      callupIds: ["c1"],
      messages: [],
      isAdmin: false,
      currentUserId: "u1",
      firstUnreadMessageId: null,
      lastReadMessageId: null,
      hasOlderMessages: false,
      nextCursor: null,
    }),
    getOlderMessages: vi.fn().mockResolvedValue({ messages: [], hasOlderMessages: false, nextCursor: null }),
    sendMessage: vi.fn().mockResolvedValue({ success: true, messageId: "m1" }),
    editMessage: vi.fn().mockResolvedValue({ success: true }),
    deleteMessage: vi.fn().mockResolvedValue({ success: true }),
    markRead: vi.fn().mockResolvedValue({ success: true }),
    getAdminPreviousCollective: vi.fn().mockResolvedValue(null),
  });

  const createMockVerifier = (): UserVerifier => ({
    verifyAccessToken: vi.fn().mockResolvedValue({
      userId: "u1",
      email: "test@example.com",
      role: "member",
    }),
  });

  it("GET /api/collective/leagues/:leagueId/summary returns 200 with summary", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCollectiveRoutes(app, { repository: repo, userVerifier: createMockVerifier() });

    const res = await app.inject({
      method: "GET",
      url: "/api/collective/leagues/l1/summary",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.callupId).toBe("c1");
    expect(repo.getActiveSummary).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1" }),
      "l1"
    );
  });

  it("POST /api/collective/leagues/:leagueId/messages sends message", async () => {
    const app = Fastify();
    const repo = createMockRepo();
    registerCollectiveRoutes(app, { repository: repo, userVerifier: createMockVerifier() });

    const res = await app.inject({
      method: "POST",
      url: "/api/collective/leagues/l1/messages",
      headers: { authorization: "Bearer valid-token" },
      payload: { callupId: "c1", body: "Gol da vitória!", kind: "text" },
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
