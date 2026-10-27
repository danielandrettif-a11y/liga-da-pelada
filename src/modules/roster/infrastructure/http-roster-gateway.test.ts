import { describe, expect, it, vi } from "vitest";
import { httpRosterGateway, RosterApiError } from "./http-roster-gateway";

const totals = {
  rounds_count: 1, games: 2, goals: 3, assists: 1, wins: 1, draws: 0, losses: 1, points: 3,
  goalkeeper_games: 0, goals_conceded: 0, clean_sheets: 0, play_seconds: 600,
};

describe("httpRosterGateway", () => {
  it("loads a validated account career using the authenticated contract", async () => {
    const career = {
      rows: [{ league_id: "league-1", league_name: "Pelada BQ", round_type: "official", ...totals }],
      overall: totals, official: totals, friendly: { ...totals, rounds_count: 0 },
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(career), {
      status: 200, headers: { "content-type": "application/json" },
    }));
    await expect(httpRosterGateway("http://backend:3001/", "token", fetcher as typeof fetch).getMyAccountCareer())
      .resolves.toEqual(career);
    const [url, options] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe("http://backend:3001/api/roster/me/career");
    expect(options.headers).toMatchObject({ authorization: "Bearer token" });
  });

  it("rejects invalid configuration, missing sessions and malformed responses", async () => {
    expect(() => httpRosterGateway("http://backend:3001", "")).toThrow("Sessão expirada");
    const invalid = httpRosterGateway("file:///tmp/backend", "token");
    await expect(invalid.getMyAccountCareer()).rejects.toBeInstanceOf(RosterApiError);
    const malformed = httpRosterGateway("http://backend:3001", "token", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ rows: [] }), { status: 200, headers: { "content-type": "application/json" } }),
    ));
    await expect(malformed.getMyAccountCareer()).rejects.toThrow("Resposta inválida");
  });

  it("preserves controlled backend messages", async () => {
    const gateway = httpRosterGateway("http://backend:3001", "token", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Carreira indisponível" }), {
        status: 503, headers: { "content-type": "application/json" },
      }),
    ));
    await expect(gateway.getMyAccountCareer()).rejects.toMatchObject({ message: "Carreira indisponível", statusCode: 503 });
  });

  it("reads and updates private balance tags through scoped player routes", async () => {
    const playerId = "00000000-0000-4000-8000-000000000001";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ allowed: true, tag: "bagre_2" }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const gateway = httpRosterGateway("http://backend:3001", "token", fetcher as typeof fetch);
    await expect(gateway.getPlayerPrivateBalanceTag(playerId)).resolves.toEqual({ allowed: true, tag: "bagre_2" });
    await expect(gateway.setPlayerPrivateBalanceTag(playerId, "craque_1")).resolves.toBeUndefined();
    expect((fetcher.mock.calls[1]?.[1] as RequestInit).body).toBe(JSON.stringify({ tag: "craque_1" }));
  });

  it("uses the selected league for fitness projections and owner-only commands", async () => {
    const playerId = "00000000-0000-4000-8000-000000000001";
    const leagueId = "00000000-0000-4000-8000-000000000002";
    const roundId = "00000000-0000-4000-8000-000000000003";
    const summary = { distanceKm: 5, averageSpeedKmh: 12, metersPerMinute: 200, entries: 1 };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ rounds: [{
        roundId, number: 1, date: "2026-10-20", roundType: "official", fitness: null,
      }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ player_id: playerId }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ player_id: playerId }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ summaries: { official: summary, friendly: summary } }), {
        status: 200, headers: { "content-type": "application/json" },
      }));
    const gateway = httpRosterGateway("http://backend:3001", "token", fetcher as typeof fetch);
    await expect(gateway.getMyFitnessRounds(playerId, leagueId)).resolves.toHaveLength(1);
    await expect(gateway.saveMyFitness(roundId, 5, 100)).resolves.toBe(playerId);
    await expect(gateway.setFitnessVisibility(true)).resolves.toBe(playerId);
    await expect(gateway.getPlayerFitnessSummaries(playerId, leagueId)).resolves.toMatchObject({ official: summary });
    expect((fetcher.mock.calls[0]?.[0] as URL).searchParams.get("league_id")).toBe(leagueId);
    expect((fetcher.mock.calls[1]?.[1] as RequestInit).body).toBe(JSON.stringify({ distance: 5, pace: 100 }));
  });
});
