import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeagueRepository } from "./application/create-league.js";
import type { GoalRepository } from "../matches/application/register-goal.js";
import { createApp } from "../../presentation/app.js";

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function fixture(enabled: boolean) {
  const leagueRepository: LeagueRepository = { create: vi.fn().mockResolvedValue("league-1") };
  const leagueMembershipRequestRepository = { request: vi.fn().mockResolvedValue(true) };
  const leagueLobbyRepository = {
    joinOpen: vi.fn().mockResolvedValue(true),
    setFavorite: vi.fn().mockResolvedValue(true),
    requestByInvite: vi.fn().mockResolvedValue("00000000-0000-4000-8000-000000000001"),
  };
  const leagueAdminRepository = {
    reviewMembershipRequest: vi.fn().mockResolvedValue(true),
    addAccount: vi.fn().mockResolvedValue(true),
    setVisibility: vi.fn().mockResolvedValue(true),
    upgradeToComplete: vi.fn().mockResolvedValue(true),
    deletePermanently: vi.fn().mockResolvedValue(true),
  };
  const leagueConfigRepository = {
    getConfig: vi.fn().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Pelada BQ",
      match_duration: 7,
      players_per_team: 5,
      teams_per_round: 3,
      preseason_enabled: false,
      stadium_name: null,
      stadium_map_url: null,
      event_duration_minutes: 120,
      visibility: "private" as const,
      logo_url: null,
      cover_url: null,
      accent_color: "#ccff00",
      can_manage: true,
    }),
    updateName: vi.fn().mockResolvedValue("Novo nome"),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    setPreseason: vi.fn().mockResolvedValue(undefined),
  };
  const quickMatchRepository = {
    create: vi.fn().mockResolvedValue({ league_id: "quick-league", callup_id: "quick-callup", round_id: "quick-round" }),
  };
  const seasonRepository = {
    getActive: vi.fn().mockResolvedValue({
      id: "season-1", league_id: "00000000-0000-4000-8000-000000000001", number: 1,
      status: "active" as const, started_at: "2026-01-01T00:00:00.000Z", ended_at: null,
      stats_snapshot: null, created_at: "2026-01-01T00:00:00.000Z",
    }),
    getActiveRoundIds: vi.fn().mockResolvedValue(["round-1"]),
    getLatestFinishedSummary: vi.fn().mockResolvedValue({ seasonId: "season-0" }),
    finish: vi.fn().mockResolvedValue({ summary: { seasonId: "season-1" }, newSeasonNumber: 2 }),
  };
  const stadiumRepository = {
    list: vi.fn().mockResolvedValue([{
      id: "00000000-0000-4000-8000-000000000002",
      league_id: "00000000-0000-4000-8000-000000000001",
      name: "Arena BQ", address: null, google_maps_url: "https://maps.example/arena",
      latitude: null, longitude: null, display_order: 1, is_active: true,
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    }]),
    create: vi.fn().mockImplementation(async (leagueId, input) => ({
      id: "00000000-0000-4000-8000-000000000002", league_id: leagueId,
      name: input.name, address: input.address, google_maps_url: input.googleMapsUrl,
      latitude: input.latitude, longitude: input.longitude, display_order: 1, is_active: true,
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    })),
    update: vi.fn().mockImplementation(async (leagueId, stadiumId, input) => ({
      id: stadiumId, league_id: leagueId, name: input.name, address: input.address,
      google_maps_url: input.googleMapsUrl, latitude: input.latitude, longitude: input.longitude,
      display_order: 1, is_active: true, created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    })),
    delete: vi.fn().mockResolvedValue(undefined),
    reorder: vi.fn().mockResolvedValue(undefined),
  };
  const repository: GoalRepository = { registerGoal: vi.fn() };
  const verifier = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: "verified-user" }) };
  const app = createApp({
    goalsEnabled: false,
    leaguesEnabled: enabled,
    verifier,
    repository,
    leagueRepository,
    leagueMembershipRequestRepository,
    leagueLobbyRepository,
    leagueAdminRepository,
    leagueConfigRepository,
    quickMatchRepository,
    seasonRepository,
    stadiumRepository,
    logger: false,
  });
  apps.push(app);
  return {
    app, verifier, leagueRepository, leagueMembershipRequestRepository,
    leagueLobbyRepository, leagueAdminRepository, leagueConfigRepository, quickMatchRepository, seasonRepository,
    stadiumRepository,
  };
}

describe("league HTTP route", () => {
  const payload = { name: " Pelada   BQ ", tier: "quick", visibility: "open" };

  it("is absent by default", async () => {
    const { app } = fixture(false);
    expect((await app.inject({ method: "POST", url: "/api/leagues", payload })).statusCode).toBe(404);
  });

  it("uses verified identity and enforces private quick leagues", async () => {
    const { app, verifier, leagueRepository } = fixture(true);
    const result = await app.inject({ method: "POST", url: "/api/leagues", payload, headers: { authorization: "Bearer valid-token" } });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toEqual({ league_id: "league-1" });
    expect(verifier.verifyAccessToken).toHaveBeenCalledWith("valid-token");
    expect(leagueRepository.create).toHaveBeenCalledWith(
      { name: "Pelada BQ", tier: "quick", visibility: "private" }, { userId: "verified-user" },
    );
  });

  it("creates the whole quick-match session through one authenticated command", async () => {
    const { app, quickMatchRepository } = fixture(true);
    const result = await app.inject({
      method: "POST", url: "/api/quick-match-sessions",
      headers: { authorization: "Bearer valid-token" },
      payload: { date: "2026-10-24", start_time: "20:30", field_name: " Arena   BQ ", map_url: "maps.example/arena" },
    });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toEqual({ league_id: "quick-league", callup_id: "quick-callup", round_id: "quick-round" });
    expect(quickMatchRepository.create).toHaveBeenCalledWith({
      date: "2026-10-24", startTime: "20:30", fieldName: "Arena BQ",
      mapUrl: "https://maps.example/arena", playersPerTeam: 5, teamsPerRound: 3,
    }, { userId: "verified-user" });
  });

  it("reads active and historical season projections with verified scope", async () => {
    const { app, seasonRepository } = fixture(true);
    const id = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const active = await app.inject({ method: "GET", url: `/api/leagues/${id}/seasons/active`, headers });
    const rounds = await app.inject({
      method: "GET", url: `/api/leagues/${id}/seasons/active/rounds?round_type=friendly`, headers,
    });
    const latest = await app.inject({ method: "GET", url: `/api/leagues/${id}/seasons/latest-finished`, headers });
    expect(active.json()).toMatchObject({ season: { id: "season-1", status: "active" } });
    expect(rounds.json()).toEqual({ round_ids: ["round-1"] });
    expect(latest.json()).toEqual({ summary: { seasonId: "season-0" } });
    expect(seasonRepository.getActive).toHaveBeenCalledWith(id, { userId: "verified-user" });
    expect(seasonRepository.getActiveRoundIds).toHaveBeenCalledWith(id, "friendly", { userId: "verified-user" });
    expect(seasonRepository.getLatestFinishedSummary).toHaveBeenCalledWith(id, { userId: "verified-user" });
  });

  it("finishes a season only with explicit confirmation", async () => {
    const { app, seasonRepository } = fixture(true);
    const id = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const invalid = await app.inject({
      method: "POST", url: `/api/leagues/${id}/seasons/active/finish`, headers, payload: { confirmation: "terminar" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(seasonRepository.finish).not.toHaveBeenCalled();
    const result = await app.inject({
      method: "POST", url: `/api/leagues/${id}/seasons/active/finish`, headers, payload: { confirmation: "Terminar" },
    });
    expect(result.json()).toEqual({ summary: { seasonId: "season-1" }, newSeasonNumber: 2 });
    expect(seasonRepository.finish).toHaveBeenCalledWith(id, { userId: "verified-user" }, expect.any(String));
  });

  it("manages stadiums through league-scoped authenticated routes", async () => {
    const { app, stadiumRepository } = fixture(true);
    const id = "00000000-0000-4000-8000-000000000001";
    const stadiumId = "00000000-0000-4000-8000-000000000002";
    const headers = { authorization: "Bearer valid-token" };
    const payload = {
      name: " Arena BQ ", address: null, google_maps_url: "maps.example/arena",
      latitude: null, longitude: null,
    };

    expect((await app.inject({ method: "GET", url: `/api/leagues/${id}/stadiums`, headers })).json())
      .toMatchObject({ stadiums: [{ id: stadiumId }] });
    const created = await app.inject({ method: "POST", url: `/api/leagues/${id}/stadiums`, headers, payload });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ stadium: { id: stadiumId, google_maps_url: "https://maps.example/arena" } });
    await app.inject({ method: "PATCH", url: `/api/leagues/${id}/stadiums/${stadiumId}`, headers, payload });
    await app.inject({ method: "PUT", url: `/api/leagues/${id}/stadiums/order`, headers, payload: { stadium_ids: [stadiumId] } });
    await app.inject({ method: "DELETE", url: `/api/leagues/${id}/stadiums/${stadiumId}`, headers });

    expect(stadiumRepository.create).toHaveBeenCalledWith(
      id,
      { name: "Arena BQ", address: null, googleMapsUrl: "https://maps.example/arena", latitude: null, longitude: null },
      { userId: "verified-user" },
    );
    expect(stadiumRepository.update).toHaveBeenCalledWith(id, stadiumId, expect.any(Object), { userId: "verified-user" });
    expect(stadiumRepository.reorder).toHaveBeenCalledWith(id, [stadiumId], { userId: "verified-user" });
    expect(stadiumRepository.delete).toHaveBeenCalledWith(id, stadiumId, { userId: "verified-user" });
  });

  it("rejects missing credentials and invalid names before persistence", async () => {
    const { app, leagueRepository } = fixture(true);
    expect((await app.inject({ method: "POST", url: "/api/leagues", payload })).statusCode).toBe(401);
    const invalid = await app.inject({ method: "POST", url: "/api/leagues", payload: { ...payload, name: "ab" }, headers: { authorization: "Bearer valid-token" } });
    expect(invalid.statusCode).toBe(400);
    expect(leagueRepository.create).not.toHaveBeenCalled();
  });

  it("requests access to a private league using only the verified identity", async () => {
    const { app, leagueMembershipRequestRepository } = fixture(true);
    const leagueId = "00000000-0000-4000-8000-000000000001";
    const result = await app.inject({
      method: "POST",
      url: `/api/leagues/${leagueId}/membership-requests`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(result.statusCode).toBe(202);
    expect(result.json()).toEqual({ requested: true });
    expect(leagueMembershipRequestRepository.request).toHaveBeenCalledWith(leagueId, { userId: "verified-user" });
  });

  it("joins open leagues, toggles favorite and accepts invite requests", async () => {
    const { app, leagueLobbyRepository } = fixture(true);
    const id = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    expect((await app.inject({ method: "POST", url: `/api/leagues/${id}/memberships`, headers })).statusCode).toBe(201);
    expect((await app.inject({
      method: "PATCH", url: `/api/leagues/${id}/favorite`, headers, payload: { favorite: true },
    })).json()).toEqual({ favorite: true });
    const invite = await app.inject({ method: "POST", url: `/api/league-invites/${id}/membership-requests`, headers });
    expect(invite.statusCode).toBe(202);
    expect(invite.json()).toEqual({ league_id: id });
    expect(leagueLobbyRepository.joinOpen).toHaveBeenCalledWith(id, { userId: "verified-user" });
    expect(leagueLobbyRepository.setFavorite).toHaveBeenCalledWith(id, true, { userId: "verified-user" });
    expect(leagueLobbyRepository.requestByInvite).toHaveBeenCalledWith(id, { userId: "verified-user" });
  });

  it("reviews membership, adds an account and updates visibility as the verified admin", async () => {
    const { app, leagueAdminRepository } = fixture(true);
    const id = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const review = await app.inject({
      method: "POST", url: `/api/league-membership-requests/${id}/review`, headers, payload: { approve: true },
    });
    const member = await app.inject({
      method: "POST", url: `/api/leagues/${id}/members`, headers, payload: { user_id: id },
    });
    const visibility = await app.inject({
      method: "PATCH", url: `/api/leagues/${id}/visibility`, headers, payload: { visibility: "open" },
    });
    expect(review.json()).toEqual({ reviewed: true });
    expect(member.statusCode).toBe(201);
    expect(member.json()).toEqual({ added: true });
    expect(visibility.json()).toEqual({ visibility: "open", updated: true });
    expect(leagueAdminRepository.reviewMembershipRequest).toHaveBeenCalledWith(id, true, { userId: "verified-user" });
    expect(leagueAdminRepository.addAccount).toHaveBeenCalledWith(id, id, { userId: "verified-user" });
    expect(leagueAdminRepository.setVisibility).toHaveBeenCalledWith(id, "open", { userId: "verified-user" });
  });

  it("reads and updates league configuration using the verified actor", async () => {
    const { app, leagueConfigRepository } = fixture(true);
    const id = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const config = await app.inject({ method: "GET", url: `/api/leagues/${id}/config`, headers });
    const name = await app.inject({
      method: "PATCH", url: `/api/leagues/${id}/name`, headers, payload: { name: " Novo   nome " },
    });
    const settingsPayload = {
      match_duration: 8, players_per_team: 6, teams_per_round: 3,
      stadium_name: "Arena", stadium_map_url: "https://maps.example/arena", event_duration_minutes: 150,
    };
    const settings = await app.inject({
      method: "PATCH", url: `/api/leagues/${id}/config`, headers, payload: settingsPayload,
    });
    const preseason = await app.inject({
      method: "PATCH", url: `/api/leagues/${id}/preseason`, headers, payload: { enabled: true },
    });

    expect(config.statusCode).toBe(200);
    expect(config.json()).toMatchObject({ id, name: "Pelada BQ", can_manage: true });
    expect(name.json()).toEqual({ name: "Novo nome" });
    expect(settings.json()).toEqual({ updated: true });
    expect(preseason.json()).toEqual({ enabled: true });
    expect(leagueConfigRepository.getConfig).toHaveBeenCalledWith(id, { userId: "verified-user" });
    expect(leagueConfigRepository.updateName).toHaveBeenCalledWith(id, "Novo nome", { userId: "verified-user" });
    expect(leagueConfigRepository.updateSettings).toHaveBeenCalledWith(id, {
      matchDuration: 8, playersPerTeam: 6, teamsPerRound: 3,
      stadiumName: "Arena", stadiumMapUrl: "https://maps.example/arena", eventDurationMinutes: 150,
    }, { userId: "verified-user" });
    expect(leagueConfigRepository.setPreseason).toHaveBeenCalledWith(id, true, { userId: "verified-user" });
  });

  it("upgrades and deletes a league through explicit admin commands", async () => {
    const { app, leagueAdminRepository } = fixture(true);
    const id = "00000000-0000-4000-8000-000000000001";
    const headers = { authorization: "Bearer valid-token" };
    const upgrade = await app.inject({ method: "POST", url: `/api/leagues/${id}/upgrade`, headers });
    const deletion = await app.inject({
      method: "DELETE", url: `/api/leagues/${id}`, headers, payload: { confirm_name: "Pelada BQ" },
    });
    expect(upgrade.json()).toEqual({ upgraded: true });
    expect(deletion.json()).toEqual({ deleted: true });
    expect(leagueAdminRepository.upgradeToComplete).toHaveBeenCalledWith(id, { userId: "verified-user" });
    expect(leagueAdminRepository.deletePermanently).toHaveBeenCalledWith(
      id, "Pelada BQ", { userId: "verified-user" },
    );
  });

  it("rejects malformed league settings before persistence", async () => {
    const { app, leagueConfigRepository } = fixture(true);
    const id = "00000000-0000-4000-8000-000000000001";
    const result = await app.inject({
      method: "PATCH",
      url: `/api/leagues/${id}/config`,
      headers: { authorization: "Bearer valid-token" },
      payload: {
        match_duration: 0, players_per_team: 5, teams_per_round: 3,
        stadium_name: "", stadium_map_url: "", event_duration_minutes: 120,
      },
    });
    expect(result.statusCode).toBe(400);
    expect(leagueConfigRepository.updateSettings).not.toHaveBeenCalled();
  });
});
