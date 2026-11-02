import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../../../shared/actor.js";
import { PgCollectiveRepository } from "./pg-collective-repository.js";

describe("PgCollectiveRepository", () => {
  const actor: Actor = { userId: "user-1", email: "user1@test.com", name: "User 1" };

  function createPool(operation: (sql: string, params?: unknown[]) => unknown) {
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK" || sql.startsWith("SET LOCAL")) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.startsWith("SELECT set_config")) return { rows: [{}], rowCount: 1 };
        return operation(sql, params);
      }),
      release: vi.fn(),
    };
    return { pool: { connect: vi.fn().mockResolvedValue(client) } as any, client };
  }

  it("loads the scoped active summary and unread count inside an authenticated transaction", async () => {
    const { pool, client } = createPool((sql) => {
      if (sql.includes("FROM public.callups callup")) {
        return { rows: [{ callup_id: "c1", date: "2026-10-30", round_id: "r1", round_number: 1,
          round_status: "in_progress", payment_pix: null, payment_total: null, has_unpaid: false, is_admin: false }] };
      }
      if (sql.includes("public.get_collective_page")) {
        return { rows: [{ page: { messages: [], unread_count: 3, has_more: false, next_cursor: null } }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const summary = await new PgCollectiveRepository(pool).getActiveSummary(actor, "l1");

    expect(summary).toMatchObject({ callupId: "c1", unreadCount: 3 });
    expect(client.query).toHaveBeenCalledWith("SET LOCAL ROLE authenticated");
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("callup.league_id = $1::uuid"), ["l1"]);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it("derives the linked player from the authenticated account before inserting", async () => {
    const { pool, client } = createPool((sql, params) => {
      if (sql.includes("profile.player_id")) {
        expect(params).toEqual(["c1", actor.userId, "l1"]);
        return { rows: [{ round_id: "r1", player_id: "player-1" }] };
      }
      if (sql.includes("INSERT INTO public.collective_messages")) {
        expect(params?.[3]).toBe("player-1");
        return { rows: [{ id: "msg-123" }], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await new PgCollectiveRepository(pool).sendMessage(actor, "l1", {
      callupId: "c1", body: "Vamos time!", kind: "text", senderPlayerId: "forged-player",
    });

    expect(result).toEqual({ success: true, messageId: "msg-123" });
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects sending when the account has no linked player", async () => {
    const { pool, client } = createPool((sql) => {
      if (sql.includes("profile.player_id")) return { rows: [{ round_id: "r1", player_id: null }] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await new PgCollectiveRepository(pool).sendMessage(actor, "l1", {
      callupId: "c1", body: "Mensagem", kind: "text",
    });

    expect(result.success).toBe(false);
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO public.collective_messages"), expect.anything());
  });

  it("scopes edits and deletions by league and authenticated user", async () => {
    const { pool, client } = createPool((sql, params) => {
      if (sql.includes("UPDATE public.collective_messages")) {
        expect(sql).toContain("callup.league_id");
        expect(params).toContain("l1");
        expect(params).toContain(actor.userId);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const repo = new PgCollectiveRepository(pool);

    expect((await repo.editMessage(actor, "l1", "msg-1", "Novo texto")).success).toBe(true);
    expect((await repo.deleteMessage(actor, "l1", "msg-1")).success).toBe(true);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects pagination for a callup outside the selected league", async () => {
    const { pool } = createPool((sql) => {
      if (sql.includes("FROM public.callups callup")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(new PgCollectiveRepository(pool).getOlderMessages(
      actor, "l1", "foreign-callup", { createdAt: "2026-10-01T00:00:00Z", id: "m1" },
    )).rejects.toThrow("não pertence à pelada selecionada");
  });
});
