import { describe, it, expect, vi } from "vitest";
import { PgCollectiveRepository } from "./pg-collective-repository.js";
import type { Actor } from "../../../shared/actor.js";

describe("PgCollectiveRepository", () => {
  const actor: Actor = { userId: "user-1", email: "user1@test.com", name: "User 1" };

  it("rejects previous conversation lookup without league admin rights", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("is_league_admin") ? { rows: [{ allowed: false }] } : { rows: [] });
    const repo = new PgCollectiveRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    expect(await repo.getPreviousCallupId(actor, "l1")).toBeNull();
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("JOIN public.rounds"), expect.anything());
  });

  it("only reads candidates for eligible members of a complete league", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT l.feature_tier")) return { rows: [{ feature_tier: "complete", is_admin: false, member_category: "guest" }] };
      return { rows: [] };
    });
    const repo = new PgCollectiveRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    expect(await repo.getCandidates(actor, "l1")).toEqual([]);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("FROM public.callups c LEFT JOIN"), expect.anything());
    expect(query).toHaveBeenCalledWith(expect.stringContaining("public.is_league_member"), ["l1", actor.userId]);
  });

  it("does not read a page if any selected callup is outside the authorized league", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("FROM public.callups c WHERE") ? { rows: [{ id: "c1" }] } : { rows: [] });
    const repo = new PgCollectiveRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    expect(await repo.getPage(actor, "l1", ["c1", "c2"], null, 60)).toBeNull();
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("get_collective_page"), expect.anything());
  });

  it("sends a message returning inserted id", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("INSERT INTO public.collective_messages") ? { rows: [{ id: "msg-123" }] } : { rows: [] });
    const mockPool: any = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) };

    const repo = new PgCollectiveRepository(mockPool);
    const res = await repo.sendMessage(actor, "l1", {
      callupId: "c1",
      body: "Vamos time!",
      kind: "text",
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toBe("msg-123");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("public.can_access_collective_chat"), [actor.userId, "c1", "l1", "Vamos time!", "text", null, null, null, null, null]);
  });

  it("only records media that exists in the private collective bucket", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("INSERT INTO public.collective_messages") ? { rows: [{ id: "msg-media" }] } : { rows: [] });
    const repo = new PgCollectiveRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    const input = { callupId: "c1", body: "Imagem", kind: "image" as const, mediaPath: "c1/u1/photo.png", mediaMime: "image/png", mediaSize: 12 };
    expect(await repo.sendMessage(actor, "l1", input)).toMatchObject({ success: true, messageId: "msg-media" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM storage.objects"), [actor.userId, "c1", "l1", "Imagem", "image", input.mediaPath, "image/png", 12, null, null]);
  });

  it("edits and deletes message checking rowCount", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("UPDATE public.collective_messages") ? { rowCount: 1 } : { rows: [] });
    const mockPool: any = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) };

    const repo = new PgCollectiveRepository(mockPool);
    const editRes = await repo.editMessage(actor, "l1", "msg-1", "Novo texto");
    expect(editRes.success).toBe(true);

    const deleteRes = await repo.deleteMessage(actor, "l1", "msg-1");
    expect(deleteRes.success).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("public.is_league_admin"), ["msg-1", "l1", actor.userId]);
  });

  it("marks only authorized messages in the selected league using the verified identity", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("INSERT INTO public.collective_reads") ? { rows: [{ callup_id: "c1" }], rowCount: 1 } : { rows: [] });
    const repo = new PgCollectiveRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    expect(await repo.markRead(actor, "l1", [{ callupId: "c1", messageId: "m1" }])).toEqual({ success: true });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("set_config('request.jwt.claim.sub'"), expect.arrayContaining([actor.userId]));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("public.can_access_collective_chat"), [JSON.stringify([{ callupId: "c1", messageId: "m1" }]), "l1", actor.userId]);
  });

  it("rolls back and reports failed read updates", async () => {
    const query = vi.fn(async (sql: string) => { if (sql.includes("INSERT INTO public.collective_reads")) throw new Error("denied"); return { rows: [] }; });
    const repo = new PgCollectiveRepository({ connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as any);
    expect(await repo.markRead(actor, "l1", [{ callupId: "c1", messageId: "m1" }])).toMatchObject({ success: false });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });
});
