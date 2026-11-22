import { describe, expect, it, vi } from "vitest";
import { PgManagerRepository } from "./pg-manager-repository.js";
import type { Actor } from "../../../shared/actor.js";

describe("PgManagerRepository", () => {
  it("refuses operations instead of reporting uncommitted commands as successful", async () => {
    const pool = { query: vi.fn() };
    const repository = new PgManagerRepository(pool as never);
    const actor: Actor = { userId: "user-1", email: "user@test.com", name: "User" };
    expect((await repository.createClub(actor, { name: "Clube", abbreviation: "CLB", color: "#000000" })).ok).toBe(false);
    expect((await repository.runCommand(actor, { type: "open-pack", packId: "p1" }, 1)).ok).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
