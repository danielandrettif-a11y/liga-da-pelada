import { describe, it, expect, vi } from "vitest";
import { ManageCollectiveUseCase, type CollectiveRepository } from "./manage-collective.js";
import type { Actor } from "../../../shared/actor.js";

describe("ManageCollectiveUseCase", () => {
  const actor: Actor = { userId: "user-1", email: "user1@test.com", name: "User 1" };

  const createMockRepo = (): CollectiveRepository => ({
    getActiveSummary: vi.fn().mockResolvedValue({
      callupId: "c1",
      roundId: "r1",
      roundNumber: 1,
      date: "2026-10-30",
      status: "in_progress",
      unreadCount: 2,
    }),
    getRoom: vi.fn().mockResolvedValue({
      summary: { callupId: "c1", roundId: "r1", roundNumber: 1, date: "2026-10-30", status: "in_progress", unreadCount: 0 },
      callupIds: ["c1"],
      messages: [],
      isAdmin: false,
      currentUserId: "user-1",
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

  it("delegates getActiveSummary and getRoom to repository", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCollectiveUseCase(repo);

    const summary = await useCase.getActiveSummary(actor, "l1");
    expect(summary?.callupId).toBe("c1");
    expect(repo.getActiveSummary).toHaveBeenCalledWith(actor, "l1");

    const room = await useCase.getRoom(actor, "l1", "c1");
    expect(room?.callupIds).toContain("c1");
    expect(repo.getRoom).toHaveBeenCalledWith(actor, "l1", "c1");
  });

  it("validates message body before sending and editing", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCollectiveUseCase(repo);

    // Empty body without media should fail
    const sendEmpty = await useCase.sendMessage(actor, "l1", { callupId: "c1", body: "", kind: "text" });
    expect(sendEmpty.success).toBe(false);
    expect(repo.sendMessage).not.toHaveBeenCalled();

    // Valid message should delegate
    const sendValid = await useCase.sendMessage(actor, "l1", { callupId: "c1", body: "Bom jogo!", kind: "text" });
    expect(sendValid.success).toBe(true);
    expect(repo.sendMessage).toHaveBeenCalled();

    // Edit validation
    const editEmpty = await useCase.editMessage(actor, "l1", "m1", "  ");
    expect(editEmpty.success).toBe(false);
    expect(repo.editMessage).not.toHaveBeenCalled();

    const editValid = await useCase.editMessage(actor, "l1", "m1", "Texto editado");
    expect(editValid.success).toBe(true);
    expect(repo.editMessage).toHaveBeenCalledWith(actor, "l1", "m1", "Texto editado");
  });

  it("delegates deletion, read marks and admin previous collective", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCollectiveUseCase(repo);

    await useCase.deleteMessage(actor, "l1", "m1");
    expect(repo.deleteMessage).toHaveBeenCalledWith(actor, "l1", "m1");

    await useCase.markRead(actor, "l1", [{ callupId: "c1", messageId: "m1" }]);
    expect(repo.markRead).toHaveBeenCalledWith(actor, "l1", [{ callupId: "c1", messageId: "m1" }]);

    await useCase.getAdminPreviousCollective(actor, "l1");
    expect(repo.getAdminPreviousCollective).toHaveBeenCalledWith(actor, "l1");
  });
});
