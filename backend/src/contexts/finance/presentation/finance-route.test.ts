import fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerFinanceRoutes } from "./finance-route.js";
import type { FinanceRepository } from "../application/manage-finance.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import type { Actor } from "../../../shared/actor.js";

describe("Finance Presentation: finance-route", () => {
  function buildApp(repoOverrides: Partial<FinanceRepository> = {}, isAdmin = true) {
    const app = fastify();
    const verifier: UserVerifier = {
      verifyAccessToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === "valid-token") {
          return {
            userId: isAdmin ? "admin-1" : "player-1",
            email: "user@example.com",
          } satisfies Actor;
        }
        return null;
      }),
    };
    const repository: FinanceRepository = {
      checkIsAdmin: vi.fn(async (actor: Actor) => actor.userId === "admin-1"),
      getExpenseItems: vi.fn().mockResolvedValue([{ id: "ei-1", name: "Bolas", total_amount: 150 }]),
      saveExpenseItem: vi.fn().mockResolvedValue({ success: true }),
      setExpenseItemStatus: vi.fn().mockResolvedValue({ success: true }),
      setExpenseItemPaidInstallments: vi.fn().mockResolvedValue({ success: true }),
      getPaymentRecipients: vi.fn().mockResolvedValue([{ id: "rec-1", name: "Pix 1" }]),
      savePaymentRecipient: vi.fn().mockResolvedValue({ success: true }),
      setPaymentRecipientActive: vi.fn().mockResolvedValue({ success: true }),
      getPaymentRounds: vi.fn().mockResolvedValue([{ id: "r1", number: 1 }]),
      getLatestFinishedRoundPaymentState: vi.fn().mockResolvedValue(null),
      getRoundPaymentWorkspace: vi.fn().mockResolvedValue({ id: "r1" }),
      getRoundPaymentPlayers: vi.fn().mockResolvedValue([{ id: "p1", name: "Atleta" }]),
      getRoundPaymentObligations: vi.fn().mockResolvedValue([{ id: "ob-1", amount_due: 25 }]),
      setPaymentObligationPaid: vi.fn().mockResolvedValue({ success: true }),
      setPlayerPayment: vi.fn().mockResolvedValue({ success: true }),
      getRoundExpenseSelections: vi.fn().mockResolvedValue([]),
      syncRoundExpenseItems: vi.fn().mockResolvedValue({ success: true }),
      updateRoundPaymentDetails: vi.fn().mockResolvedValue({ success: true }),
      getRoundPaymentChargeLines: vi.fn().mockResolvedValue([]),
      getPaymentAuditLog: vi.fn().mockResolvedValue([{ id: 1, target_player_name: "Atleta" }]),
      ...repoOverrides,
    };
    registerFinanceRoutes(app, { verifier, repository });
    return app;
  }

  it("returns 401 when Authorization header is missing", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/finance/leagues/l1/expenses",
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns expense items when authorized", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/finance/leagues/l1/expenses",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Bolas");
  });

  it("saves expense item", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/finance/leagues/l1/expenses",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        name: "Churrasco",
        totalAmount: 200,
        installmentCount: 2,
        recipientId: "rec-1",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it("fetches payment obligations", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/finance/leagues/l1/rounds/r1/obligations",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body[0].amount_due).toBe(25);
  });

  it("sets player payment", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/finance/leagues/l1/rounds/r1/payments",
      headers: { authorization: "Bearer valid-token" },
      payload: { playerId: "p1", paid: true },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });
});

