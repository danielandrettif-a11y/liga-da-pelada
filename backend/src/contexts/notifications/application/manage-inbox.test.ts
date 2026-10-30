import { describe, expect, it, vi } from "vitest";
import {
  getInboxPreview,
  markInboxRead,
  syncAndListInbox,
  type InboxRepository,
} from "./manage-inbox.js";

describe("manage-inbox application service", () => {
  const actor = { userId: "00000000-0000-4000-8000-000000000001" };
  const leagueId = "00000000-0000-4000-8000-000000000002";

  it("delegates preview query using authenticated actor id", async () => {
    const repository: InboxRepository = {
      getPreview: vi.fn().mockResolvedValue([
        {
          id: "notif-1",
          title: "Aviso",
          body: "Corpo",
          href: "/cartola",
          state: "active",
          read_at: null,
          created_at: "2026-10-29T00:00:00Z",
          updated_at: "2026-10-29T00:00:00Z",
        },
      ]),
      markRead: vi.fn(),
      syncAndList: vi.fn(),
    };

    const result = await getInboxPreview(actor, repository);
    expect(result).toHaveLength(1);
    expect(repository.getPreview).toHaveBeenCalledWith(actor.userId);
  });

  it("marks inbox items as read for authenticated actor", async () => {
    const repository: InboxRepository = {
      getPreview: vi.fn(),
      markRead: vi.fn().mockResolvedValue(true),
      syncAndList: vi.fn(),
    };

    const result = await markInboxRead(actor, repository, ["notif-1", "notif-2"]);
    expect(result).toEqual({ success: true });
    expect(repository.markRead).toHaveBeenCalledWith(actor.userId, ["notif-1", "notif-2"]);
  });

  it("validates desired notifications and syncs inbox", async () => {
    const repository: InboxRepository = {
      getPreview: vi.fn(),
      markRead: vi.fn(),
      syncAndList: vi.fn().mockResolvedValue([]),
    };

    const desired = [
      {
        type: "tactical_revolution_r2",
        key: `announcement:tactical_r2:${leagueId}`,
        title: "⚡ Bônus de Posição Ativos no Cartola!",
        body: "Pontuação atualizada.",
        href: "/cartola",
      },
    ];

    await syncAndListInbox(actor, leagueId, desired, repository);
    expect(repository.syncAndList).toHaveBeenCalledWith(actor.userId, leagueId, [
      {
        type: "tactical_revolution_r2",
        key: `announcement:tactical_r2:${leagueId}`,
        title: "⚡ Bônus de Posição Ativos no Cartola!",
        body: "Pontuação atualizada.",
        href: "/cartola",
      },
    ]);
  });
});

