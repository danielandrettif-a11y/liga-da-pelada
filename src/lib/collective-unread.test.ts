import { describe, expect, it } from "vitest";
import { collectiveUnreadFromRows } from "./collective-unread";

const message = (id: string, callupId: string, userId: string | null, createdAt: string, extras = {}) => ({
  id,
  callup_id: callupId,
  sender_user_id: userId,
  kind: "text",
  deleted_at: null,
  created_at: createdAt,
  ...extras,
});

describe("collectiveUnreadFromRows", () => {
  it("separa marcadores por convocação e ignora mensagens próprias, apagadas ou de sistema", () => {
    const rows = [
      message("a1", "a", "other", "2026-10-01T10:00:00Z"),
      message("b1", "b", "other", "2026-10-01T10:01:00Z"),
      message("a2", "a", "other", "2026-10-01T10:02:00Z"),
      message("b2", "b", "me", "2026-10-01T10:03:00Z"),
      message("a3", "a", "other", "2026-10-01T10:04:00Z", { deleted_at: "2026-10-01T10:05:00Z" }),
      message("a4", "a", null, "2026-10-01T10:06:00Z", { kind: "system" }),
    ];
    expect(collectiveUnreadFromRows(rows, [{ callup_id: "a", last_read_message_id: "a1" }], "me"))
      .toEqual({ count: 2, firstUnreadMessageId: "b1", lastReadMessageId: null });
  });

  it("usa todas as mensagens quando o marcador não está na janela", () => {
    const rows = [message("new", "a", "other", "2026-10-01T10:00:00Z")];
    expect(collectiveUnreadFromRows(rows, [{ callup_id: "a", last_read_message_id: "old" }], "me").count).toBe(1);
  });
});
