import { describe, expect, it, vi, beforeEach } from "vitest";
import { httpFantasyGateway } from "./http-fantasy-gateway";

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
          authorization: "Bearer mock-token",
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
    const input = { fantasySeasonId: "season-1", roundId: "round-1", playerIds: ["p1"], slotAssignments: [{ slotRole: "ATA" as const, slotIndex: 0, playerId: "p1" }], captainId: "p1", scorerId: "p1", assistId: null, challengeId: null, reservePlayerId: "p2", reserveRole: "ATA" as const };
    const result = await gateway.saveLineup("league-1", "round-1", input);

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.pelada.test/api/fantasy/leagues/league-1/rounds/round-1/lineup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      })
    );
  });

  it("loads live match snapshots with the user session", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "m1" }] } as Response);
    const gateway = httpFantasyGateway(baseUrl, token);
    await expect(gateway.getLiveMatchSnapshots("league-1", "round-1")).resolves.toEqual([{ id: "m1" }]);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.pelada.test/api/fantasy/leagues/league-1/rounds/round-1/match-snapshots", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer mock-token" }) }));
  });

  it("loads the protected projection inputs", async () => {
    const input = { settings: {}, lineups: [], players: [] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => input } as Response);
    const gateway = httpFantasyGateway(baseUrl, token);
    await expect(gateway.getLiveProjectionInputs("league-1", "round-1")).resolves.toEqual(input);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.pelada.test/api/fantasy/leagues/league-1/rounds/round-1/projection-inputs", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer mock-token" }) }));
  });

  it("loads the detailed revealed inputs for a selected round", async () => {
    const input = { lineups: [], players: [], reserves: [], prices: [], profiles: [], predictions: [], activations: [] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => input } as Response);
    const gateway = httpFantasyGateway(baseUrl, token);
    await expect(gateway.getRevealedInputs("league-1", "round-1")).resolves.toEqual(input);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.pelada.test/api/fantasy/leagues/league-1/rounds/round-1/revealed-inputs", expect.anything());
  });

  it("loads the season ranking inputs using the session", async () => {
    const input = { accounts: [], rounds: [], lineups: [] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => input } as Response);
    const gateway = httpFantasyGateway(baseUrl, token);
    await expect(gateway.getRankingPeriodInputs("league-1")).resolves.toEqual(input);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.pelada.test/api/fantasy/leagues/league-1/ranking-period-inputs", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer mock-token" }) }));
  });

  it("loads the league-scoped market source", async () => {
    const source = { prices: [], stats: [], players: [], history: [] };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => source } as Response);
    await expect(httpFantasyGateway(baseUrl, token).getMarketSource("league-1")).resolves.toEqual(source);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.pelada.test/api/fantasy/leagues/league-1/market-source", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer mock-token" }) }));
  });

  it("loads the active season market context", async () => {
    const context = { seasonId: "s1", settings: {}, testSession: null, fantasySeason: null, fantasyRounds: [], marketHealth: null, marketVersion: null };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => context } as Response);
    await expect(httpFantasyGateway(baseUrl, token).getMarketContext("league-1")).resolves.toEqual(context);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.pelada.test/api/fantasy/leagues/league-1/market-context", expect.anything());
  });

  it("requests personal market data with only the selected round identifiers", async () => {
    const data = { seasonId: "fs1", lineup: null, latestLineup: null, portfolio: null, account: null, latestCardActivation: null };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => data } as Response);
    await expect(httpFantasyGateway(baseUrl, token).getPersonalMarketInputs("league-1", "fr1", "fr2")).resolves.toEqual(data);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.pelada.test/api/fantasy/leagues/league-1/personal-market-inputs?activeRoundId=fr1&latestRoundId=fr2", expect.anything());
  });

  it("requests personal test-session data without an active official round", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    await httpFantasyGateway(baseUrl, token).getPersonalMarketInputs("league-1", null, "fr2", "ts1");
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.pelada.test/api/fantasy/leagues/league-1/personal-market-inputs?latestRoundId=fr2&testSessionId=ts1", expect.anything());
  });

  it("returns a validation error to the interface", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: "INVALID_LINEUP", message: "Orçamento estourado." }),
    } as Response);

    const gateway = httpFantasyGateway(baseUrl, token);
    await expect(
      gateway.saveLineup("l1", "r1", {} as any)
    ).resolves.toEqual({ success: false, error: "Orçamento estourado." });
  });

  it("throws FantasyApiError on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const gateway = httpFantasyGateway(baseUrl, token);
    await expect(gateway.getDashboard("l1")).rejects.toThrow("Falha de conexão com a API de Fantasy");
  });

  it("returns administrative validation errors without hiding server failures", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ message: "Configuração inválida." }) } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: "Serviço indisponível." }) } as Response);
    const gateway = httpFantasyGateway(baseUrl, token);
    await expect(gateway.updateSettings("l1", {})).resolves.toEqual({ success: false, error: "Configuração inválida." });
    await expect(gateway.reprocessRound("l1", "r1")).rejects.toThrow("Serviço indisponível.");
  });
});
