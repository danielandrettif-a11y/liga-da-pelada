import { describe, expect, it, vi, beforeEach } from "vitest";
import { httpFantasyGateway, FantasyApiError } from "./http-fantasy-gateway";

describe("httpFantasyGateway", () => {
  const baseUrl = "https://api.pelada.test";
  const token = "mock-token";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches dashboard successfully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, available: true, budget: 100 }),
    } as Response);

    const gateway = httpFantasyGateway(baseUrl, token);
    const result = await gateway.getDashboard("league-1");

    expect(result.authenticated).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.pelada.test/api/fantasy/leagues/league-1/dashboard",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mock-token",
        }),
      })
    );
  });

  it("saves lineup via POST", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, lineupId: "lineup-123" }),
    } as Response);

    const gateway = httpFantasyGateway(baseUrl, token);
    const result = await gateway.saveLineup(
      "league-1",
      "round-1",
      [{ slotRole: "ATA", playerId: "p1" }],
      "p1"
    );

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.pelada.test/api/fantasy/leagues/league-1/rounds/round-1/lineup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          slots: [{ slotRole: "ATA", playerId: "p1" }],
          captainPlayerId: "p1",
        }),
      })
    );
  });

  it("throws FantasyApiError on HTTP error status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: "INVALID_LINEUP", message: "Orçamento estourado." }),
    } as Response);

    const gateway = httpFantasyGateway(baseUrl, token);
    await expect(
      gateway.saveLineup("l1", "r1", [], "p1")
    ).rejects.toThrow("Orçamento estourado.");
  });

  it("throws FantasyApiError on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const gateway = httpFantasyGateway(baseUrl, token);
    await expect(gateway.getDashboard("l1")).rejects.toThrow("Falha de conexão com a API de Fantasy");
  });
});
