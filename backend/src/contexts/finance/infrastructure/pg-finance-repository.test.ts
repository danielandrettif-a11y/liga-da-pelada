import { describe, expect, it, vi } from "vitest";
import { PgFinanceRepository } from "./pg-finance-repository.js";
import type { Pool, PoolClient } from "pg";

describe("Finance Infrastructure: PgFinanceRepository", () => {
  const actor = { userId: "u1" };

  it("checks admin status via SQL query", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) =>
      sql.includes("is_league_admin") ? { rows: [{ is_admin: true }], rowCount: 1 } : { rows: [], rowCount: 0 });
    const mockPool = {
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() } as unknown as PoolClient),
    } as unknown as Pool;
    const repo = new PgFinanceRepository(mockPool);
    const isAdmin = await repo.checkIsAdmin({ userId: "u1" }, "l1");
    expect(isAdmin).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("is_league_admin"),
      ["l1"],
    );
  });

  it("gets expense items", async () => {
    const query = vi.fn().mockResolvedValue({
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
      });
    const mockPool = {
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() } as unknown as PoolClient),
    } as unknown as Pool;
    const repo = new PgFinanceRepository(mockPool);
    const items = await repo.getExpenseItems(actor, "l1", false);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Bolas");
    expect(items[0].recipient?.name).toBe("Loja");
  });

  it("lists payment rounds only from the active season", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() } as unknown as PoolClient),
    } as unknown as Pool;
    const repo = new PgFinanceRepository(pool);
    await repo.getPaymentRounds(actor, "l1");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("season.status = 'active'"),
      ["l1"],
    );
  });

  it("saves expense item", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => ({
      rows: [],
      rowCount: sql.includes("INSERT INTO public.league_expense_items") ? 1 : 0,
    }));
    const mockPool = {
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() } as unknown as PoolClient),
    } as unknown as Pool;
    const repo = new PgFinanceRepository(mockPool);
    const result = await repo.saveExpenseItem("l1", "u1", {
      name: "Churrasco",
      totalAmount: 200,
      installmentCount: 2,
      recipientId: "rec-1",
    });
    expect(result.success).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO public.league_expense_items"),
      expect.arrayContaining(["l1", "Churrasco"]),
    );
  });

  it("updates player payment and inserts audit log", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("FROM public.round_players")) return { rows: [{ exists: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const mockPool = {
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() } as unknown as PoolClient),
    } as unknown as Pool;
    const repo = new PgFinanceRepository(mockPool);
    const result = await repo.setPlayerPayment("l1", "r1", "p1", true, "u1");
    expect(result.success).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO public.round_payments"),
      expect.any(Array),
    );
    expect(query).toHaveBeenCalledWith("COMMIT");
  });
});

