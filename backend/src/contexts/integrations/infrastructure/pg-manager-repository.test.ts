import { describe, it, expect, vi } from "vitest";
import { PgManagerRepository } from "./pg-manager-repository.js";
import type { Actor } from "../../../shared/actor.js";

describe("PgManagerRepository", () => {
  const actor: Actor = { userId: "user-1", email: "user1@test.com", name: "User 1" };

  it("creates a new club and returns initial save", async () => {
    const mockPool: any = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: "c1", state: {} }] }),
    };

    const repo = new PgManagerRepository(mockPool);
    const res = await repo.createClub(actor, {
      name: "Goytacaz",
      abbreviation: "GOY",
      color: "#0000ff",
    });

    expect(res.ok).toBe(true);
    expect(res.save?.version).toBe(1);
    expect(mockPool.query).toHaveBeenCalled();
  });

  it("runs command against existing club", async () => {
    const mockPool: any = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ state: { coins: 100 } }] })
        .mockResolvedValueOnce({ rowCount: 1 }),
    };

    const repo = new PgManagerRepository(mockPool);
    const res = await repo.runCommand(actor, { type: "open-pack", packId: "p1" }, 1);

    expect(res.ok).toBe(true);
    expect(res.save?.version).toBe(2);
  });
});
