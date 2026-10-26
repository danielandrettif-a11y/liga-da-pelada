import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgIdentityProfileRepository } from "./pg-identity-profile-repository.js";

describe("pgIdentityProfileRepository", () => {
  it("repairs the profile under the verified user claims", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await pgIdentityProfileRepository(pool).ensureProfile({ userId: "verified-user" });
    expect(query).toHaveBeenCalledWith("SET LOCAL ROLE authenticated");
    expect(query).toHaveBeenCalledWith("SELECT public.ensure_my_player_account()");
  });

  it("hides database failure details", async () => {
    const query = vi.fn().mockRejectedValue(new Error("sensitive SQL detail"));
    const pool = { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
    await expect(pgIdentityProfileRepository(pool).ensureProfile({ userId: "verified-user" }))
      .rejects.toThrow("concluir o perfil");
  });
});
