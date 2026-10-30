import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  httpFinanceGateway,
  FinanceApiError,
} from "./http-finance-gateway";

describe("httpFinanceGateway", () => {
  const baseUrl = "https://api.liga.test";
  const accessToken = "valid-token";
  const leagueId = "00000000-0000-4000-8000-000000000001";

  it("fetches expense items via GET", async () => {
    const items = [{ id: "ei-1", name: "Bolas", total_amount: 100 }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => items,
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpFinanceGateway(baseUrl, accessToken);
    const result = await gateway.getExpenseItems(leagueId);

    expect(result).toEqual(items);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/finance/leagues/${leagueId}/expenses`,
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${accessToken}`,
        }),
      }),
    );
  });

  it("saves expense item via POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpFinanceGateway(baseUrl, accessToken);
    const result = await gateway.saveExpenseItem(leagueId, {
      name: "Bolas",
      totalAmount: 100,
      installmentCount: 2,
      recipientId: "rec-1",
    });

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/finance/leagues/${leagueId}/expenses`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("routes workspace and round payment updates", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => {
        if (url.includes("/workspace")) return { id: "r1" };
        if (url.includes("/has-pending")) return { hasPending: true };
        return { success: true };
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpFinanceGateway(baseUrl, accessToken);
    await expect(gateway.getRoundPaymentWorkspace(leagueId, "r1")).resolves.toEqual({ id: "r1" });
    await expect(gateway.hasPendingPaymentRound(leagueId)).resolves.toBe(true);
    await expect(gateway.setPlayerPayment(leagueId, "r1", "p1", true)).resolves.toEqual({ success: true });
  });

  it("throws FinanceApiError on HTTP error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: "Acesso negado" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const gateway = httpFinanceGateway(baseUrl, accessToken);
    await expect(gateway.getExpenseItems(leagueId)).rejects.toThrow(FinanceApiError);
  });
});
