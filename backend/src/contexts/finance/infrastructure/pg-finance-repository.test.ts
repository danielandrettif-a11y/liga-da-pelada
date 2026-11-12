import { describe, expect, it, vi } from "vitest";
import { PgFinanceRepository } from "./pg-finance-repository.js";
import type { Pool } from "pg";

describe("Finance Infrastructure: PgFinanceRepository", () => {
  const createMockPool = (queryHandler: (sql: string, params?: any[]) => Promise<any>): { pool: Pool; clientQuery: any } => {
    const clientQuery = vi.fn().mockImplementation((sql: string, params?: any[]) => {
      if (
        sql.includes("SET LOCAL ROLE") ||
        sql.includes("BEGIN") ||
        sql.includes("COMMIT") ||
        sql.includes("SET LOCAL search_path")
      ) {
        return Promise.resolve({});
      }
      return queryHandler(sql, params);
    });

    const client = {
      query: clientQuery,
      release: vi.fn(),
    };

    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    return { pool, clientQuery };
  };

  it("checks admin status via SQL query", async () => {
    const { pool, clientQuery } = createMockPool(async () => ({ rows: [{ is_admin: true }] }));
    const repo = new PgFinanceRepository(pool);
    const isAdmin = await repo.checkIsAdmin({ userId: "u1" }, "l1");
    expect(isAdmin).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("public.league_members"),
      ["u1", "l1"],
    );
  });

  it("gets expense items", async () => {
    const { pool } = createMockPool(async () => ({
      rows: [
        {
          id: "ei-1",
          name: "Bolas",
          total_amount: 150,
          installment_count: 3,
          status: "active",
          recipient_id: "rec-1",
          recipient_name: "Loja",
          recipient_pix_key: "loja@pix",
        },
      ],
    }));
    const repo = new PgFinanceRepository(pool);
    const items = await repo.getExpenseItems("l1", false);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Bolas");
    expect(items[0].recipient?.name).toBe("Loja");
  });

  it("saves expense item", async () => {
    const { pool, clientQuery } = createMockPool(async () => ({ rows: [] }));
    const repo = new PgFinanceRepository(pool);
    const result = await repo.saveExpenseItem("l1", "u1", {
      name: "Churrasco",
      totalAmount: 200,
      installmentCount: 2,
      recipientId: "rec-1",
    });
    expect(result.success).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO public.league_expense_items"),
      expect.arrayContaining(["l1", "Churrasco"]),
    );
  });

  it("updates player payment and inserts audit log", async () => {
    const { pool, clientQuery } = createMockPool(async () => ({ rows: [] }));
    const repo = new PgFinanceRepository(pool);
    const result = await repo.setPlayerPayment("l1", "r1", "p1", true, "u1");
    expect(result.success).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO public.round_payments"),
      expect.any(Array),
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO public.round_payment_audit"),
      expect.any(Array),
    );
  });
});
