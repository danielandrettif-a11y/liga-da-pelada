import { describe, expect, it, vi, beforeEach } from "vitest";
import { httpCardsGateway, CardsApiError } from "./http-cards-gateway";

describe("httpCardsGateway", () => {
  const baseUrl = "https://api.pelada.test";
  const token = "mock-token";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches user packs successfully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ availablePacks: [], totalPacks: 2 }),
    } as Response);

    const gateway = httpCardsGateway(baseUrl, token);
    const result = await gateway.getMyPacks("league-1");

    expect(result.totalPacks).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.pelada.test/api/cards/leagues/league-1/packs",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mock-token",
        }),
      })
    );
  });

  it("activates card for round via POST", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const gateway = httpCardsGateway(baseUrl, token);
    const result = await gateway.activateCardForRound("l1", "r1", {
      userCardId: "uc1",
      cardSlug: "luva-de-ouro",
      targetPlayerId: "p1",
    });

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.pelada.test/api/cards/leagues/l1/rounds/r1/activate",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("throws CardsApiError on HTTP error status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: "INVALID_CARD", message: "Carta inválida." }),
    } as Response);

    const gateway = httpCardsGateway(baseUrl, token);
    await expect(
      gateway.activateCardForRound("l1", "r1", { userCardId: "uc1", cardSlug: "c1" })
    ).rejects.toThrow("Carta inválida.");
  });
});
