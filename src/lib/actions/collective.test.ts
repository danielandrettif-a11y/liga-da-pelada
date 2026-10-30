import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: any) => fn,
}));

const mockCollectiveApi = {
  getActiveCollectiveSummary: vi.fn().mockResolvedValue({ callupId: "c1", unreadCount: 0 }),
  getCollectiveRoom: vi.fn().mockResolvedValue({
    summary: { callupId: "c1", unreadCount: 0 },
    callupIds: ["c1"],
    messages: [],
    isAdmin: false,
    currentUserId: "u1",
    firstUnreadMessageId: null,
    lastReadMessageId: null,
    hasOlderMessages: false,
    nextCursor: null,
  }),
  getOlderCollectiveMessages: vi.fn().mockResolvedValue({
    success: true,
    messages: [],
    hasOlderMessages: false,
    nextCursor: null,
  }),
  sendCollectiveMessage: vi.fn().mockResolvedValue({ success: true }),
  editCollectiveMessage: vi.fn().mockResolvedValue({ success: true }),
  deleteCollectiveMessage: vi.fn().mockResolvedValue({ success: true }),
  markCollectiveRead: vi.fn().mockResolvedValue({ success: true }),
  getAdminPreviousCollective: vi.fn().mockResolvedValue(null),
};

vi.mock("@/modules/collective/infrastructure/collective-api-session", () => ({
  collectiveApiFor: vi.fn().mockImplementation(() => Promise.resolve(mockCollectiveApi)),
}));

vi.mock("../auth", () => ({
  getCurrentAccount: vi.fn().mockResolvedValue({
    user: { id: "user-123" },
    isAdmin: true,
    client: { from: vi.fn() },
    profile: { player_id: "player-123" },
  }),
}));

vi.mock("../league-context", () => ({
  getSelectedLeague: vi.fn().mockResolvedValue({ id: "league-123", role: "admin", featureTier: "complete" }),
}));

import {
  getActiveCollectiveSummary,
  getCollectiveRoom,
  getOlderCollectiveMessages,
  sendCollectiveMessage,
  editCollectiveMessage,
  deleteCollectiveMessage,
  markCollectiveRead,
  getAdminPreviousCollective,
} from "./collective";

describe("Server Actions: Collective Bridging (8 operations)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates read operations to collectiveApi", async () => {
    const summary = await getActiveCollectiveSummary();
    expect(mockCollectiveApi.getActiveCollectiveSummary).toHaveBeenCalledWith("league-123");
    expect(summary?.callupId).toBe("c1");

    const room = await getCollectiveRoom("c1");
    expect(mockCollectiveApi.getCollectiveRoom).toHaveBeenCalledWith("league-123", "c1");
    expect(room?.callupIds).toContain("c1");

    const older = await getOlderCollectiveMessages("c1", { id: "m1", createdAt: "" });
    expect(mockCollectiveApi.getOlderCollectiveMessages).toHaveBeenCalledWith("league-123", "c1", { id: "m1", createdAt: "" });
    expect(older.success).toBe(true);
  });

  it("delegates mutation operations to collectiveApi", async () => {
    const formData = new FormData();
    formData.set("callup_id", "c1");
    formData.set("body", "Vamos galera!");
    const sendRes = await sendCollectiveMessage(formData);
    expect(mockCollectiveApi.sendCollectiveMessage).toHaveBeenCalled();
    expect(sendRes.success).toBe(true);

    const editRes = await editCollectiveMessage("m1", "Texto editado");
    expect(mockCollectiveApi.editCollectiveMessage).toHaveBeenCalledWith("league-123", "m1", "Texto editado");
    expect(editRes.success).toBe(true);

    const deleteRes = await deleteCollectiveMessage("m1");
    expect(mockCollectiveApi.deleteCollectiveMessage).toHaveBeenCalledWith("league-123", "m1");
    expect(deleteRes.success).toBe(true);

    const readRes = await markCollectiveRead([{ callupId: "c1", messageId: "m1" }]);
    expect(mockCollectiveApi.markCollectiveRead).toHaveBeenCalledWith("league-123", [{ callupId: "c1", messageId: "m1" }]);
    expect(readRes.success).toBe(true);
  });

  it("delegates admin previous collective to collectiveApi", async () => {
    await getAdminPreviousCollective();
    expect(mockCollectiveApi.getAdminPreviousCollective).toHaveBeenCalledWith("league-123");
  });
});
