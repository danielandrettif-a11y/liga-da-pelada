import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgPrivateBalanceTagRepository } from "./pg-private-balance-tag-repository.js";

const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "00000000-0000-4000-8000-000000000002" };

describe("pgPrivateBalanceTagRepository", () => {
  it("keeps unauthorized reads indistinguishable and blocks writes", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("can_manage_private_balance_tags")
      ? { rows: [{ allowed: false }] }
      : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repository = pgPrivateBalanceTagRepository(pool);
    await expect(repository.get(playerId, actor)).resolves.toEqual({ allowed: false, tag: null });
    await expect(repository.set(playerId, "bagre_1", actor)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("upserts and removes the private tag under verified claims", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("can_manage_private_balance_tags")
      ? { rows: [{ allowed: true }] }
      : sql.includes("SELECT balance_tag")
        ? { rows: [{ balance_tag: "craque_2" }] }
        : { rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repository = pgPrivateBalanceTagRepository(pool);
    await expect(repository.get(playerId, actor)).resolves.toEqual({ allowed: true, tag: "craque_2" });
    await repository.set(playerId, "bagre_2", actor);
    await repository.set(playerId, null, actor);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO public.player_private_balance_tags"), [playerId, "bagre_2", actor.userId]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM public.player_private_balance_tags"), [playerId]);
  });
});
