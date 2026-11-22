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

  it("creates an atomic quick-match session through its stable HTTP contract", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      league_id: "quick-league", callup_id: "quick-callup", round_id: "quick-round",
    }), { status: 201 }));
    const gateway = httpLeagueGateway("http://backend:3001", "token", request as typeof fetch);
    await expect(gateway.createQuickMatch({
      date: "2026-10-24", start_time: "20:30", field_name: "Arena", map_url: "",
    })).resolves.toEqual({ league_id: "quick-league", callup_id: "quick-callup", round_id: "quick-round" });
    const [url, options] = request.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/quick-match-sessions");
    expect(options.method).toBe("POST");
    expect(JSON.parse(String(options.body))).toEqual({
      date: "2026-10-24", start_time: "20:30", field_name: "Arena", map_url: "",
    });
  });

  it("maps season queries and transition to stable HTTP contracts", async () => {
    const summary = { seasonId: "season-1" };
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ season: { id: "season-1" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ round_ids: ["round-1"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ summary }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ summary, newSeasonNumber: 2 }), { status: 200 }));
    const gateway = httpLeagueGateway("http://backend:3001", "token", request as typeof fetch);
    await gateway.getActiveSeason(leagueId);
    await gateway.getActiveSeasonRoundIds(leagueId, "friendly");
    await gateway.getLatestFinishedSeason(leagueId);
    await gateway.finishSeason(leagueId, "Terminar");
    expect(request.mock.calls.map(([url, options]) => ({
      method: (options as RequestInit).method,
      path: (url as URL).pathname + (url as URL).search,
      body: (options as RequestInit).body ? JSON.parse(String((options as RequestInit).body)) : null,
    }))).toEqual([
      { method: "GET", path: `/api/leagues/${leagueId}/seasons/active`, body: null },
      { method: "GET", path: `/api/leagues/${leagueId}/seasons/active/rounds?round_type=friendly`, body: null },
      { method: "GET", path: `/api/leagues/${leagueId}/seasons/latest-finished`, body: null },
      {
        method: "POST", path: `/api/leagues/${leagueId}/seasons/active/finish`,
        body: { confirmation: "Terminar" },
      },
    ]);
  });

  it("maps stadium CRUD and ordering to league-scoped HTTP contracts", async () => {
    const stadium = {
      id: "00000000-0000-4000-8000-000000000002", league_id: leagueId, name: "Arena BQ",
      address: null, google_maps_url: "https://maps.example/arena", latitude: null, longitude: null,
      display_order: 1, is_active: true, created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ stadiums: [stadium] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stadium }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stadium }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ reordered: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    const gateway = httpLeagueGateway("http://backend:3001", "token", request as typeof fetch);
    const input = {
      name: stadium.name, address: null, google_maps_url: stadium.google_maps_url,
      latitude: null, longitude: null,
    };

    await expect(gateway.getStadiums(leagueId)).resolves.toEqual([stadium]);
    await expect(gateway.saveStadium(leagueId, input)).resolves.toEqual(stadium);
    await expect(gateway.saveStadium(leagueId, { ...input, id: stadium.id })).resolves.toEqual(stadium);
    await gateway.reorderStadiums(leagueId, [stadium.id]);
    await gateway.deleteStadium(leagueId, stadium.id);

    expect(request.mock.calls.map(([url, options]) => ({
      method: (options as RequestInit).method,
      path: (url as URL).pathname,
      body: (options as RequestInit).body ? JSON.parse(String((options as RequestInit).body)) : null,
    }))).toEqual([
      { method: "GET", path: `/api/leagues/${leagueId}/stadiums`, body: null },
      { method: "POST", path: `/api/leagues/${leagueId}/stadiums`, body: input },
      { method: "PATCH", path: `/api/leagues/${leagueId}/stadiums/${stadium.id}`, body: input },
      { method: "PUT", path: `/api/leagues/${leagueId}/stadiums/order`, body: { stadium_ids: [stadium.id] } },
      { method: "DELETE", path: `/api/leagues/${leagueId}/stadiums/${stadium.id}`, body: null },
    ]);
  });

  it("maps presentation completion and league selection authorization", async () => {
    const request = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const gateway = httpLeagueGateway("http://backend:3001", "token", request as typeof fetch);
    await gateway.completeEntryFlow(1);
    await gateway.authorizeSelection(leagueId, "active");
    await gateway.authorizeSelection(leagueId, "archived-quick");
    expect(request.mock.calls.map(([url, options]) => ({
      method: (options as RequestInit).method,
      path: (url as URL).pathname,
      body: JSON.parse(String((options as RequestInit).body)),
    }))).toEqual([
      { method: "POST", path: "/api/account/entry-flow/complete", body: { version: 1 } },
      { method: "POST", path: `/api/leagues/${leagueId}/selection`, body: { mode: "active" } },
      { method: "POST", path: `/api/leagues/${leagueId}/selection`, body: { mode: "archived-quick" } },
    ]);
  });

  it("sends branding as multipart without overriding its boundary", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      logoUrl: "https://public/logo.png", accentColor: "#aabbcc",
    }), { status: 200 }));
    const gateway = httpLeagueGateway("http://backend:3001", "token", request as typeof fetch);
    const formData = new FormData();
    formData.set("accent_color", "#AABBCC");
    await expect(gateway.updateBranding(leagueId, formData)).resolves.toEqual({
      logoUrl: "https://public/logo.png", accentColor: "#aabbcc",
    });
    const [url, options] = request.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe(`/api/leagues/${leagueId}/branding`);
    expect(options.method).toBe("PATCH");
    expect(options.body).toBe(formData);
    expect(options.headers).toEqual({ authorization: "Bearer token" });
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
    await gateway.upgrade(leagueId);
    await gateway.deleteLeague(leagueId, "Pelada BQ");

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
      { method: "POST", path: `/api/leagues/${leagueId}/upgrade`, body: null },
      { method: "DELETE", path: `/api/leagues/${leagueId}`, body: { confirm_name: "Pelada BQ" } },
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
