import { describe, expect, it, vi, beforeEach } from "vitest";
import { httpCardsGateway } from "./http-cards-gateway";

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

  it("maps saved offers and opening results to the application's card catalog", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ availablePacks: [{ id: "p1", status: "opened", cardSlugOffer1: "golden_goal", cardSlugOffer2: "golden_assist" }], totalPacks: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, offers: [{ slug: "golden_goal" }, { slug: "golden_assist" }] }) });
    const gateway = httpCardsGateway(baseUrl, token);
    const packs = await gateway.getMyPacks("league-1");
    const opened = await gateway.openPack("league-1", "p1");
    expect(packs.availablePacks[0].offers.map((offer: any) => offer.card.slug)).toEqual(["golden_goal", "golden_assist"]);
    expect(opened.offers[0]).toMatchObject({ slug: "golden_goal", rarity: "COMMON", effectType: "CONDITIONAL_PLAYER_BONUS" });
  });

  it("groups inventory while counting only cards available for use", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cards: [
      { id: "one", slug: "golden_goal", status: "OWNED" },
      { id: "two", slug: "golden_goal", status: "CONSUMED" },
    ] }) } as Response);
    const result = await httpCardsGateway(baseUrl, token).getMyInventory("league-1");
    expect(result.availableCount).toBe(1);
    expect(result.groupedBySlug.golden_goal.count).toBe(1);
    expect(result.groupedBySlug.golden_goal.instances).toHaveLength(2);
    expect(result.cards[0].icon).toBeTruthy();
  });

  it("maps the active card to the complete catalog definition", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cardSlug: "golden_goal", userCardId: "card-1", status: "RESERVED" }) } as Response);
    const result = await httpCardsGateway(baseUrl, token).getActiveCardForRound("league-1", "round-1");
    expect(result.card).toMatchObject({ slug: "golden_goal", rarity: "COMMON" });
    expect(result.userCardId).toBe("card-1");
  });

  it("returns validation errors to the card interface", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: "INVALID_CARD", message: "Carta inválida." }),
    } as Response);

    const gateway = httpCardsGateway(baseUrl, token);
    await expect(
      gateway.activateCardForRound("l1", "r1", { userCardId: "uc1", cardSlug: "c1" })
    ).resolves.toEqual({ success: false, error: "Carta inválida." });
  });

  it("returns a removal error to the interface when the market is closed", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ success: false, error: "Mercado fechado." }) } as Response);
    await expect(httpCardsGateway(baseUrl, token).removeActiveCardForRound("l1", "r1")).resolves.toEqual({ success: false, error: "Mercado fechado." });
  });
});
