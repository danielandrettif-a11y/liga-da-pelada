import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxRepository } from "../application/manage-inbox.js";
import { createApp } from "../../../presentation/app.js";

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function fixture() {
  const inboxRepository: InboxRepository = {
    getPreview: vi.fn().mockResolvedValue([
      {
        id: "notif-1",
        title: "Título Preview",
        body: "Corpo Preview",
        href: "/cartola",
        state: "active",
        read_at: null,
        created_at: "2026-10-29T00:00:00Z",
        updated_at: "2026-10-29T00:00:00Z",
      },
    ]),
    markRead: vi.fn().mockResolvedValue(true),
    syncAndList: vi.fn().mockResolvedValue([
      {
        id: "notif-2",
        title: "Título Sync",
        body: "Corpo Sync",
        href: "/cartola",
        state: "active",
        read_at: null,
        created_at: "2026-10-29T00:00:00Z",
        updated_at: "2026-10-29T00:00:00Z",
      },
    ]),
  };

  const verifier = {
    verifyAccessToken: vi.fn().mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000001" }),
  };

  const app = createApp({
    goalsEnabled: false,
    notificationsEnabled: true,
    verifier,
    repository: {} as any,
    inboxRepository,
    pushConfig: {} as any,
    pushSubscriptions: {} as any,
    preferencesRepository: {} as any,
    logger: false,
  });
  apps.push(app);

  return { app, inboxRepository, verifier };
}

describe("inbox routes", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const { app } = fixture();
    const response = await app.inject({
      method: "GET",
      url: "/api/notifications/inbox/preview",
    });
    expect(response.statusCode).toBe(401);
  });

  it("handles GET /api/notifications/inbox/preview", async () => {
    const { app, inboxRepository } = fixture();
    const response = await app.inject({
      method: "GET",
      url: "/api/notifications/inbox/preview",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(inboxRepository.getPreview).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
  });

  it("handles POST /api/notifications/inbox/read", async () => {
    const { app, inboxRepository } = fixture();
    const response = await app.inject({
      method: "POST",
      url: "/api/notifications/inbox/read",
      headers: { authorization: "Bearer valid-token" },
      payload: { ids: ["notif-1"] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(inboxRepository.markRead).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      ["notif-1"],
    );
  });

  it("handles POST /api/notifications/inbox/sync", async () => {
    const { app, inboxRepository } = fixture();
    const response = await app.inject({
      method: "POST",
      url: "/api/notifications/inbox/sync",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        leagueId: "00000000-0000-4000-8000-000000000002",
        desired: [
          {
            type: "announcement",
            key: "announcement:test",
            title: "Aviso",
            body: "Corpo do aviso",
            href: "/cartola",
          },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(inboxRepository.syncAndList).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      expect.any(Array),
    );
  });
});

