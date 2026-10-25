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
    toggleFavorite: vi.fn().mockResolvedValue(true),
    requestByInvite: vi.fn().mockResolvedValue("00000000-0000-4000-8000-000000000001"),
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
    logger: false,
  });
  apps.push(app);
  return { app, verifier, leagueRepository, leagueMembershipRequestRepository, leagueLobbyRepository };
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
    expect((await app.inject({ method: "PATCH", url: `/api/leagues/${id}/favorite`, headers })).json()).toEqual({ favorite: true });
    const invite = await app.inject({ method: "POST", url: `/api/league-invites/${id}/membership-requests`, headers });
    expect(invite.statusCode).toBe(202);
    expect(invite.json()).toEqual({ league_id: id });
    expect(leagueLobbyRepository.joinOpen).toHaveBeenCalledWith(id, { userId: "verified-user" });
    expect(leagueLobbyRepository.toggleFavorite).toHaveBeenCalledWith(id, { userId: "verified-user" });
    expect(leagueLobbyRepository.requestByInvite).toHaveBeenCalledWith(id, { userId: "verified-user" });
  });
});
