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
      expect.stringContaining("public.is_league_admin"),
      ["l1"],
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
    const items = await repo.getExpenseItems("l1", false, "u1");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Bolas");
    expect(items[0].recipient?.name).toBe("Loja");
  });

  it("saves expense item", async () => {
    const { pool, clientQuery } = createMockPool(async () => ({ rows: [], rowCount: 1 }));
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

  it("updates a participant payment in the authenticated transaction", async () => {
    const { pool, clientQuery } = createMockPool(async () => ({ rows: [], rowCount: 1 }));
    const repo = new PgFinanceRepository(pool);
    const result = await repo.setPlayerPayment("l1", "r1", "p1", true, "u1");
    expect(result.success).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO public.round_payments"),
      expect.any(Array),
    );
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("set_config('request.jwt.claim.sub'"), expect.arrayContaining(["u1"]));
  });

  it("rolls back if a payment write fails", async () => {
    const { pool, clientQuery } = createMockPool(async (sql) => {
      if (sql.includes("INSERT INTO public.round_payments")) throw new Error("falha de escrita");
      return { rows: [], rowCount: 1 };
    });
    const result = await new PgFinanceRepository(pool).setPlayerPayment("l1", "r1", "p1", true, "u1");
    expect(result.success).toBe(false);
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(clientQuery).not.toHaveBeenCalledWith("COMMIT");
  });

  it("does not charge an obligation from another league", async () => {
    const { pool, clientQuery } = createMockPool(async () => ({ rows: [], rowCount: 0 }));
    const result = await new PgFinanceRepository(pool).setPaymentObligationPaid("other-league", "obligation", 10, "u1");
    expect(result.success).toBe(false);
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining("set_round_payment_obligation_paid"), expect.anything());
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("maps the database workspace to the frontend contract", async () => {
    const { pool } = createMockPool(async (sql) => sql.includes("get_round_payment_read_model")
      ? { rows: [{ model: { players: [{ player: { id: "p1", name: "Atleta" }, paid: true }], obligations: [{ amount_due: "10.50", amount_paid: "2.00" }], charge_lines: [{ amount: "10.50" }], expense_installments: [{ expense_item_id: "e1", installment_number: "2" }] } }] }
      : { rows: [{ id: "r1" }], rowCount: 1 });
    const workspace = await new PgFinanceRepository(pool).getRoundPaymentWorkspace("r1", "l1", "u1");
    expect(workspace).toEqual({ players: [{ id: "p1", name: "Atleta", paid: true, paid_at: null }], obligations: [{ amount_due: 10.5, amount_paid: 2 }], chargeLines: [{ amount: 10.5 }], expenseSelections: [{ expense_item_id: "e1", installment_number: 2 }] });
  });
});
