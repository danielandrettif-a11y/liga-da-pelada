import { describe, expect, it, vi } from "vitest";
import { asLeagueCreator, httpLeagueGateway } from "./http-league-gateway";
import { DuplicateLeagueNameError } from "../application/create-league";

const leagueId = "00000000-0000-4000-8000-000000000001";

describe("httpLeagueGateway", () => {
  it("forwards authenticated league commands without exposing the token in the URL", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ league_id: leagueId }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ favorite: true }), { status: 200 }));
    const gateway = httpLeagueGateway("http://backend:3001/", "verified-token", request as typeof fetch);

    await expect(gateway.create({ name: "Pelada BQ", tier: "basic", visibility: "private" }))
      .resolves.toBe(leagueId);
    await gateway.setFavorite(leagueId, true);

    const [createUrl, createOptions] = request.mock.calls[0] as [URL, RequestInit];
    expect(createUrl.href).toBe("http://backend:3001/api/leagues");
    expect(createOptions.headers).toMatchObject({ authorization: "Bearer verified-token" });
    expect(createUrl.href).not.toContain("verified-token");
    const [favoriteUrl, favoriteOptions] = request.mock.calls[1] as [URL, RequestInit];
    expect(favoriteUrl.href).toBe(`http://backend:3001/api/leagues/${leagueId}/favorite`);
    expect(JSON.parse(String(favoriteOptions.body))).toEqual({ favorite: true });
    expect(favoriteOptions.cache).toBe("no-store");
  });

  it("maps duplicate names to the application error", async () => {
    const request = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: "Já existe uma pelada com esse nome." }),
      { status: 409 },
    ));
    const creator = asLeagueCreator(httpLeagueGateway("http://backend:3001", "token", request as typeof fetch));
    await expect(creator.create({ name: "Pelada BQ", tier: "basic", visibility: "private" }))
      .rejects.toBeInstanceOf(DuplicateLeagueNameError);
  });

  it("maps every migrated lobby command to its stable HTTP contract", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: leagueId, name: "Pelada BQ", can_manage: true }), { status: 200 }))
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const gateway = httpLeagueGateway("http://backend:3001", "token", request as typeof fetch);

    await gateway.getConfig(leagueId);
    await gateway.requestMembership(leagueId);
    await gateway.joinOpen(leagueId);
    await gateway.requestByInvite("invite-token");
    await gateway.reviewMembership("request-id", true);
    await gateway.addExistingAccount(leagueId, "user-id");
    await gateway.setVisibility(leagueId, "open");
    request.mockResolvedValueOnce(new Response(JSON.stringify({ name: "Novo nome" }), { status: 200 }));
    await gateway.updateName(leagueId, "Novo nome");
    await gateway.updateSettings(leagueId, {
      match_duration: 8, players_per_team: 6, teams_per_round: 3,
      stadium_name: "Arena", stadium_map_url: "https://maps.example/arena", event_duration_minutes: 150,
    });
    await gateway.setPreseason(leagueId, true);

    expect(request.mock.calls.map(([url, options]) => ({
      method: (options as RequestInit).method,
      path: (url as URL).pathname,
      body: (options as RequestInit).body ? JSON.parse(String((options as RequestInit).body)) : null,
    }))).toEqual([
      { method: "GET", path: `/api/leagues/${leagueId}/config`, body: null },
      { method: "POST", path: `/api/leagues/${leagueId}/membership-requests`, body: null },
      { method: "POST", path: `/api/leagues/${leagueId}/memberships`, body: null },
      { method: "POST", path: "/api/league-invites/invite-token/membership-requests", body: null },
      { method: "POST", path: "/api/league-membership-requests/request-id/review", body: { approve: true } },
      { method: "POST", path: `/api/leagues/${leagueId}/members`, body: { user_id: "user-id" } },
      { method: "PATCH", path: `/api/leagues/${leagueId}/visibility`, body: { visibility: "open" } },
      { method: "PATCH", path: `/api/leagues/${leagueId}/name`, body: { name: "Novo nome" } },
      {
        method: "PATCH", path: `/api/leagues/${leagueId}/config`,
        body: {
          match_duration: 8, players_per_team: 6, teams_per_round: 3,
          stadium_name: "Arena", stadium_map_url: "https://maps.example/arena", event_duration_minutes: 150,
        },
      },
      { method: "PATCH", path: `/api/leagues/${leagueId}/preseason`, body: { enabled: true } },
    ]);
  });

  it("rejects invalid base URLs and transport failures with a stable domain-facing error", async () => {
    expect(() => httpLeagueGateway("http://backend:3001", ""))
      .toThrow("Sessão expirada");
    const badUrl = httpLeagueGateway("file:///tmp/backend", "token");
    await expect(badUrl.joinOpen(leagueId)).rejects.toThrow("Endereço da API");
    const offline = httpLeagueGateway(
      "http://backend:3001",
      "token",
      vi.fn().mockRejectedValue(new Error("offline")) as typeof fetch,
    );
    await expect(offline.joinOpen(leagueId)).rejects.toThrow("não respondeu");
  });
});
