import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: any) => fn,
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../supabase/service", () => ({ createServiceClient: vi.fn(() => null) }));

const mockCollectiveApi = {
  getPreviousCallupId: vi.fn().mockResolvedValue({ callupId: null }),
  getCandidates: vi.fn(),
  getPage: vi.fn(),
  sendCollectiveMessage: vi.fn().mockResolvedValue({ success: true }),
  editCollectiveMessage: vi.fn().mockResolvedValue({ success: true }),
  deleteCollectiveMessage: vi.fn().mockResolvedValue({ success: true }),
  markCollectiveRead: vi.fn().mockResolvedValue({ success: true }),
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
import { collectiveApiFor } from "@/modules/collective/infrastructure/collective-api-session";
import { getCurrentAccount } from "../auth";
import { after } from "next/server";

describe("Server Actions: Collective Bridging (8 operations)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollectiveApi.getCandidates.mockResolvedValue([{ id: "c1", date: "2026-01-01", status: "converted", round_id: "r1", round: { id: "r1", number: 2, status: "in_progress" } }]);
    mockCollectiveApi.getPage.mockResolvedValue({ messages: [], unread_count: 3, has_more: false, next_cursor: null });
    mockCollectiveApi.sendCollectiveMessage.mockResolvedValue({ success: true });
  });

  it("composes summary, room and older messages from the scoped candidates and page APIs", async () => {
    const summary = await getActiveCollectiveSummary();
    expect(summary?.callupId).toBe("c1");

    const room = await getCollectiveRoom("c1");
    expect(room?.callupIds).toContain("c1");

    const cursor = { id: "m1", createdAt: "2026-01-01T00:00:00Z" };
    const older = await getOlderCollectiveMessages("c1", cursor);
    expect(older.success).toBe(true);
    expect(mockCollectiveApi.getCandidates).toHaveBeenCalledWith("league-123");
    expect(mockCollectiveApi.getPage).toHaveBeenCalledWith("league-123", ["c1"], cursor, 60);
  });

  it("builds the current summary from modular candidates and a paginated unread count", async () => {
    expect(await getActiveCollectiveSummary()).toMatchObject({ callupId: "c1", roundId: "r1", unreadCount: 3 });
    expect(mockCollectiveApi.getCandidates).toHaveBeenCalledWith("league-123");
    expect(mockCollectiveApi.getPage).toHaveBeenCalledWith("league-123", ["c1"], null, 1);
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

  it("schedules the existing push notification after a modular text message is saved", async () => {
    mockCollectiveApi.sendCollectiveMessage.mockResolvedValueOnce({ success: true, messageId: "m1" } as any);
    const form = new FormData();
    form.set("callup_id", "c1");
    form.set("body", "  Olá!  ");
    expect(await sendCollectiveMessage(form)).toEqual({ success: true });
    expect(mockCollectiveApi.sendCollectiveMessage).toHaveBeenCalledWith("league-123", expect.objectContaining({ body: "Olá!", kind: "text" }));
    expect(after).toHaveBeenCalledWith(expect.any(Function));
  });

  it("does not schedule a notification when saving fails", async () => {
    mockCollectiveApi.sendCollectiveMessage.mockResolvedValueOnce({ success: false, error: "Negado" } as any);
    const form = new FormData(); form.set("callup_id", "c1"); form.set("body", "Olá");
    expect(await sendCollectiveMessage(form)).toEqual({ success: false, error: "Negado" });
    expect(after).not.toHaveBeenCalled();
  });

  it("uploads attachments and registers them through the modular API", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getCurrentAccount).mockResolvedValueOnce({
      user: { id: "user-123" }, isAdmin: true,
      client: { storage: { from: vi.fn().mockReturnValue({ upload, remove }) } },
      profile: { player_id: "player-123" },
    } as any);
    mockCollectiveApi.sendCollectiveMessage.mockResolvedValueOnce({ success: true, messageId: "m-image" });
    const form = new FormData(); form.set("callup_id", "c1"); form.set("media", new File(["image"], "photo.png", { type: "image/png" }));
    expect(await sendCollectiveMessage(form)).toEqual({ success: true });
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^c1\/user-123\/.+\.png$/), expect.any(File), expect.objectContaining({ contentType: "image/png" }));
    expect(mockCollectiveApi.sendCollectiveMessage).toHaveBeenCalledWith("league-123", expect.objectContaining({ kind: "image", mediaMime: "image/png", mediaSize: 5 }));
    expect(after).toHaveBeenCalledWith(expect.any(Function));
  });

  it("removes a modular upload when the database rejects the message", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getCurrentAccount).mockResolvedValueOnce({
      user: { id: "user-123" }, isAdmin: true,
      client: { storage: { from: vi.fn().mockReturnValue({ upload, remove }) } },
      profile: { player_id: "player-123" },
    } as any);
    mockCollectiveApi.sendCollectiveMessage.mockResolvedValueOnce({ success: false, error: "Negado" });
    const form = new FormData(); form.set("callup_id", "c1"); form.set("media", new File(["audio"], "voice.webm", { type: "audio/webm" })); form.set("duration", "4");
    expect(await sendCollectiveMessage(form)).toEqual({ success: false, error: "Negado" });
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^c1\/user-123\/.+\.webm$/)]);
  });

  it("removes a modular upload when the backend is unavailable", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getCurrentAccount).mockResolvedValueOnce({
      user: { id: "user-123" }, isAdmin: true,
      client: { storage: { from: vi.fn().mockReturnValue({ upload, remove }) } },
      profile: { player_id: "player-123" },
    } as any);
    mockCollectiveApi.sendCollectiveMessage.mockRejectedValueOnce(new Error("offline"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const form = new FormData(); form.set("callup_id", "c1"); form.set("media", new File(["image"], "photo.png", { type: "image/png" }));
    expect(await sendCollectiveMessage(form)).toEqual({ success: false, error: "O serviço da Coletiva está indisponível." });
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^c1\/user-123\/.+\.png$/)]);
    consoleError.mockRestore();
  });

  it("delegates admin previous collective to collectiveApi", async () => {
    await getAdminPreviousCollective();
    expect(mockCollectiveApi.getPreviousCallupId).toHaveBeenCalledWith("league-123");
  });

  it("opens the selected previous conversation when one exists", async () => {
    mockCollectiveApi.getPreviousCallupId.mockResolvedValueOnce({ callupId: "c1" });
    const room = await getAdminPreviousCollective();
    expect(room?.summary.callupId).toBe("c1");
    expect(mockCollectiveApi.getCandidates).toHaveBeenCalledWith("league-123");
  });
});
