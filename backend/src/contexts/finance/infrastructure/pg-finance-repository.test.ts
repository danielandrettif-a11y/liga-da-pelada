import { describe, expect, it, vi } from "vitest";
import { PgFinanceRepository } from "./pg-finance-repository.js";
import type { Pool } from "pg";

describe("Finance Infrastructure: PgFinanceRepository", () => {
  it("checks admin status via SQL query", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ is_admin: true }] }),
    } as unknown as Pool;
    const repo = new PgFinanceRepository(mockPool);
    const isAdmin = await repo.checkIsAdmin({ userId: "u1" }, "l1");
    expect(isAdmin).toBe(true);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT (lm.role = 'admin'"),
      ["u1", "l1"],
    );
  });

  it("gets expense items", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
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
      }),
    } as unknown as Pool;
    const repo = new PgFinanceRepository(mockPool);
    const items = await repo.getExpenseItems("l1", false);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Bolas");
    expect(items[0].recipient?.name).toBe("Loja");
  });

  it("saves expense item", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;
    const repo = new PgFinanceRepository(mockPool);
    const result = await repo.saveExpenseItem("l1", "u1", {
      name: "Churrasco",
      totalAmount: 200,
      installmentCount: 2,
      recipientId: "rec-1",
    });
    expect(result.success).toBe(true);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO expense_items"),
      expect.arrayContaining(["l1", "Churrasco"]),
    );
  });

  it("updates player payment and inserts audit log", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;
    const repo = new PgFinanceRepository(mockPool);
    const result = await repo.setPlayerPayment("l1", "r1", "p1", true, "u1");
    expect(result.success).toBe(true);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO round_payments"),
      expect.any(Array),
    );
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO payment_audit_log"),
      expect.any(Array),
    );
  });
});

