import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgAccountAccessRepository } from "./pg-account-access-repository.js";

const actor = { userId: "verified-user" };

describe("pgAccountAccessRepository", () => {
  it("lists mapped accounts and changes roles under authenticated claims", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("list_manageable_accounts")) return { rows: [{
        user_id: "00000000-0000-4000-8000-000000000001", role: "admin",
        created_at: new Date("2026-01-01T00:00:00.000Z"), player_id: "player-1",
        player_name: "Ana", player_nickname: null, player_avatar_url: "avatar.png",
      }] };
      if (sql.includes("manage_account_admin_role")) return { rows: [{ role: "player" }] };
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    const repository = pgAccountAccessRepository(pool);
    await expect(repository.list(actor)).resolves.toEqual([{
      userId: "00000000-0000-4000-8000-000000000001", role: "admin",
      createdAt: "2026-01-01T00:00:00.000Z",
      player: { id: "player-1", name: "Ana", nickname: null, avatarUrl: "avatar.png" },
    }]);
    await expect(repository.setRole("00000000-0000-4000-8000-000000000001", "player", actor))
      .resolves.toBe("player");
    expect(query).toHaveBeenCalledWith("SET LOCAL ROLE authenticated");
    expect(query).toHaveBeenCalledWith(
      "SELECT public.manage_account_admin_role($1::uuid, $2::boolean) AS role",
      ["00000000-0000-4000-8000-000000000001", false],
    );
  });

  it("translates authorization failures without leaking SQL details", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("list_manageable_accounts")) throw new Error("Somente administradores podem consultar acessos.");
      return { rows: [] };
    });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgAccountAccessRepository(pool).list(actor)).rejects.toMatchObject({ statusCode: 403 });
  });
});
