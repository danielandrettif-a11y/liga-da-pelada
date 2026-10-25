import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { pgGoalRepository } from "./pg-goal-repository.js";

const command = {
  matchId: "00000000-0000-4000-8000-000000000001",
  playerId: "00000000-0000-4000-8000-000000000002",
  teamId: "00000000-0000-4000-8000-000000000003",
  idempotencyKey: "goal-1",
};

function fixture(receipt?: object, failure?: Error) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes("public.register_goal") && failure) throw failure;
    if (sql.includes("public.register_goal")) return { rows: [{ receipt }] };
    return { rows: [] };
  });
  const release = vi.fn();
  const pool = { connect: vi.fn().mockResolvedValue({ query, release }) } as unknown as Pool;
  return { repository: pgGoalRepository(pool), query, release };
}

describe("pgGoalRepository", () => {
  it("sets the verified actor in a local transaction before committing", async () => {
    const receipt = { event_id: "event", round_id: "round", score_a: 1, score_b: 0, idempotent: false };
    const { repository, query, release } = fixture(receipt);
    await expect(repository.registerGoal(command, { userId: "verified-user" })).resolves.toEqual(receipt);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN", "SET LOCAL ROLE authenticated",
      expect.stringContaining("request.jwt.claim.sub"),
      expect.stringContaining("public.register_goal"), "COMMIT",
    ]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      "verified-user", JSON.stringify({ sub: "verified-user", role: "authenticated" }),
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back and maps a reused key to conflict", async () => {
    const { repository, query, release } = fixture(undefined, new Error("Chave de idempotência reutilizada com outro conteúdo."));
    await expect(repository.registerGoal(command, { userId: "verified-user" }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });
});
