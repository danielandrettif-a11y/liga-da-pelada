import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgInboxRepository } from "./pg-inbox-repository.js";

describe("pgInboxRepository", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const leagueId = "00000000-0000-4000-8000-000000000002";

  it("queries inbox preview with limit 10 and active unread filter", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM public.user_inbox_notifications")) {
        return {
          rows: [
            {
              id: "notif-1",
              title: "Prévia",
              body: "Corpo",
              href: "/cartola",
              state: "active",
              read_at: null,
              created_at: "2026-10-29T00:00:00Z",
              updated_at: "2026-10-29T00:00:00Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgInboxRepository(pool);
    const preview = await repo.getPreview(userId);

    expect(preview).toHaveLength(1);
    expect(preview[0].id).toBe("notif-1");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT 10"),
      [userId],
    );
  });

  it("marks notifications as read by specific ids", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgInboxRepository(pool);

    const result = await repo.markRead(userId, ["00000000-0000-4000-8000-000000000010"]);
    expect(result).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("ANY($2::uuid[])"),
      [userId, ["00000000-0000-4000-8000-000000000010"]],
    );
  });

  it("marks all unread notifications as read when no ids provided", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgInboxRepository(pool);

    const result = await repo.markRead(userId);
    expect(result).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE user_id = $1::uuid\n                 AND read_at IS NULL"),
      [userId],
    );
  });

  it("syncs desired notifications and returns updated list", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT id, dedupe_key, read_at, state")) {
        return { rows: [] };
      }
      if (sql.includes("LIMIT 30")) {
        return {
          rows: [
            {
              id: "notif-sync-1",
              title: "Sincronizada",
              body: "Corpo",
              href: "/cartola",
              state: "active",
              read_at: null,
              created_at: "2026-10-29T00:00:00Z",
              updated_at: "2026-10-29T00:00:00Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repo = pgInboxRepository(pool);

    const items = await repo.syncAndList(userId, leagueId, [
      {
        type: "announcement",
        key: "announcement:test",
        title: "Título",
        body: "Corpo",
        href: "/cartola",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("notif-sync-1");
  });
});

