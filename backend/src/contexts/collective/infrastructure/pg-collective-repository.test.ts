import { describe, it, expect, vi } from "vitest";
import { PgCollectiveRepository } from "./pg-collective-repository.js";
import type { Actor } from "../../../shared/actor.js";

describe("PgCollectiveRepository", () => {
  const actor: Actor = { userId: "user-1", email: "user1@test.com", name: "User 1" };

  it("loads active summary and counts unread messages", async () => {
    const mockPool: any = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{ callup_id: "c1", date: "2026-10-30", callup_status: "converted", round_id: "r1", round_number: 1, round_status: "in_progress" }],
        })
        .mockResolvedValueOnce({
          rows: [{ unread: 3 }],
        }),
    };

    const repo = new PgCollectiveRepository(mockPool);
    const summary = await repo.getActiveSummary(actor, "l1");

    expect(summary?.callupId).toBe("c1");
    expect(summary?.unreadCount).toBe(3);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it("sends a message returning inserted id", async () => {
    const mockPool: any = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "msg-123" }] }),
    };

    const repo = new PgCollectiveRepository(mockPool);
    const res = await repo.sendMessage(actor, "l1", {
      callupId: "c1",
      body: "Vamos time!",
      kind: "text",
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toBe("msg-123");
  });

  it("edits and deletes message checking rowCount", async () => {
    const mockPool: any = {
      query: vi.fn()
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 }),
    };

    const repo = new PgCollectiveRepository(mockPool);
    const editRes = await repo.editMessage(actor, "l1", "msg-1", "Novo texto");
    expect(editRes.success).toBe(true);

    const deleteRes = await repo.deleteMessage(actor, "l1", "msg-1");
    expect(deleteRes.success).toBe(true);
  });
});
