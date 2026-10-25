import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { withAuthenticatedTransaction } from "./authenticated-transaction.js";

function fixture(failOn?: string, rollbackFails = false) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql === failOn || (sql === "ROLLBACK" && rollbackFails)) throw new Error(`${sql} failed`);
    return { rows: [] };
  });
  const release = vi.fn();
  const pool = { connect: vi.fn().mockResolvedValue({ query, release }) } as unknown as Pool;
  return { pool, query, release };
}

describe("withAuthenticatedTransaction", () => {
  const actor = { userId: "verified-user" };

  it("sets role and claims locally before the operation and commits", async () => {
    const { pool, query, release } = fixture();
    const result = await withAuthenticatedTransaction(pool, actor, async (client) => {
      await client.query("SELECT protected_operation()");
      return "done";
    });
    expect(result).toBe("done");
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN", "SET LOCAL ROLE authenticated", expect.stringContaining("request.jwt.claim.sub"),
      "SELECT protected_operation()", "COMMIT",
    ]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      "verified-user", JSON.stringify({ sub: "verified-user", role: "authenticated" }),
    ]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("rolls back a failed operation and discards a connection when rollback also fails", async () => {
    const { pool, query, release } = fixture("SELECT protected_operation()", true);
    await expect(withAuthenticatedTransaction(pool, actor, async (client) => {
      await client.query("SELECT protected_operation()");
    })).rejects.toThrow("SELECT protected_operation() failed");
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledWith(true);
  });

  it("does not run the operation if authentication context cannot be set", async () => {
    const { pool, query } = fixture("SET LOCAL ROLE authenticated");
    const operation = vi.fn();
    await expect(withAuthenticatedTransaction(pool, actor, operation)).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
});
