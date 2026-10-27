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

  it("reads, updates and draws from league-scoped speed ratings", async () => {
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const first = "00000000-0000-4000-8000-000000000001";
    const second = "00000000-0000-4000-8000-000000000002";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ratings: { [first]: 3, [second]: null } }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        teams: [[first], [second]],
        teamSummaries: [
          { stars: { 1: 0, 2: 0, 3: 1 }, average: 3 },
          { stars: { 1: 0, 2: 1, 3: 0 }, average: 2 },
        ],
        unratedCount: 1,
        attendanceOrder: [],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    const gateway = httpRosterGateway("http://backend:3001", "token", fetcher as typeof fetch);
    await expect(gateway.getPlayerSpeedRatings(leagueId)).resolves.toEqual({ [first]: 3, [second]: null });
    await expect(gateway.setPlayerSpeedRating(leagueId, first, 2)).resolves.toBeUndefined();
    await expect(gateway.drawTeamsBySpeed(leagueId, {
      playerIds: [first, second], teamCount: 2, playersPerTeam: 1,
    })).resolves.toMatchObject({ teams: [[first], [second]], unratedCount: 1 });
    expect((fetcher.mock.calls[1]?.[1] as RequestInit).body).toBe(JSON.stringify({ rating: 2 }));
    expect((fetcher.mock.calls[2]?.[1] as RequestInit).method).toBe("POST");
  });

  it("reads and advances league-scoped roster activity", async () => {
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const seenThrough = "2026-10-20T10:01:00.000Z";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 2, lastSeenAt: "2026-10-20T10:00:00.000Z" }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ playerIds: ["player-a"], seenThrough }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const gateway = httpRosterGateway("http://backend:3001", "token", fetcher as typeof fetch);
    await expect(gateway.getRosterUnreadState(leagueId)).resolves.toMatchObject({ count: 2 });
    await expect(gateway.getUnreadRosterPlayers(leagueId)).resolves.toEqual({
      playerIds: ["player-a"], seenThrough,
    });
    await expect(gateway.markRosterActivitySeenThrough(leagueId, seenThrough)).resolves.toBeUndefined();
    await expect(gateway.markRosterActivitySeen(leagueId)).resolves.toBeUndefined();
    expect((fetcher.mock.calls[2]?.[1] as RequestInit).body).toBe(JSON.stringify({ seenThrough }));
    expect((fetcher.mock.calls[3]?.[1] as RequestInit).method).toBe("PUT");
  });

  it("loads complete player lists and details from the selected league", async () => {
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const playerId = "00000000-0000-4000-8000-000000000001";
    const player = {
      id: playerId, name: "Jogador", nickname: null, profile_bio: null, avatar_url: null,
      avatar_alternate_url: null, player_profile: "offensive", initial_player_profile: "offensive",
      profile_decision_source: "initial", profile_source_round_id: null, overall_traits: ["offensive"],
      overall_seed_mode: "observed", is_goalkeeper: false, member_category: "player", is_selectable: true,
      is_competitive_profile_complete: false, show_fitness_stats: false, registration_source: "admin",
      profile_scope: "persistent", created_by_user_id: null, created_at: "2026-10-20T10:00:00.000Z",
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ players: [player] }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ player }), {
        status: 200, headers: { "content-type": "application/json" },
      }));
    const gateway = httpRosterGateway("http://backend:3001", "token", fetcher as typeof fetch);
    await expect(gateway.getPlayers(leagueId, true)).resolves.toEqual([player]);
    await expect(gateway.getPlayer(leagueId, playerId)).resolves.toEqual(player);
    expect((fetcher.mock.calls[0]?.[0] as URL).searchParams.get("selectable_only")).toBe("true");
    expect((fetcher.mock.calls[1]?.[0] as URL).pathname).toContain(`/players/${playerId}`);
  });

  it("loads validated player statistics and grouped rosters", async () => {
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const player = {
      id: "00000000-0000-4000-8000-000000000001", name: "Jogador", nickname: null,
      profile_bio: null, avatar_url: null, avatar_alternate_url: null, player_profile: "offensive",
      initial_player_profile: "offensive", profile_decision_source: "initial", profile_source_round_id: null,
      overall_traits: ["offensive"], overall_seed_mode: "observed", is_goalkeeper: false,
      member_category: "player", is_selectable: true, is_competitive_profile_complete: false,
      show_fitness_stats: false, registration_source: "admin", profile_scope: "persistent",
      created_by_user_id: null, created_at: "2026-10-20T10:00:00.000Z", rounds: 2,
      games: 4, goals: 3, assists: 1, wins: 1, draws: 1, losses: 0,
      points: 9.5, legacyPoints: 4, overall: 82,
      overallPositions: { DEF: 80, ALA_MEI: 83, ATA: 85, GOL: 70 },
    };
    const groups = { officialPlayers: [player], activeGuests: [], wags: [], supporters: [] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ players: [player] }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(groups), {
        status: 200, headers: { "content-type": "application/json" },
      }));
    const gateway = httpRosterGateway("http://backend:3001", "token", fetcher as typeof fetch);
    await expect(gateway.getPlayersWithStats(leagueId, "official", true)).resolves.toEqual([player]);
    await expect(gateway.getRosterGroups(leagueId, "official")).resolves.toEqual(groups);
    expect((fetcher.mock.calls[0]?.[0] as URL).searchParams.get("selectable_only")).toBe("true");
    expect((fetcher.mock.calls[0]?.[0] as URL).searchParams.get("round_type")).toBe("official");
    expect((fetcher.mock.calls[1]?.[0] as URL).pathname).toContain("/roster-groups");
  });

  it("rejects malformed statistics payloads", async () => {
    const gateway = httpRosterGateway("http://backend:3001", "token", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ players: [{ id: "incomplete" }] }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    ));
    await expect(gateway.getPlayersWithStats("league", "official")).rejects.toThrow("Resposta inválida");
  });

  it("creates, updates, swaps and imports through player-management routes", async () => {
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const playerId = "00000000-0000-4000-8000-000000000001";
    const player = {
      id: playerId, name: "Convidado", nickname: null, profile_bio: null, avatar_url: "active.jpg",
      avatar_alternate_url: "alternate.jpg", player_profile: "offensive", initial_player_profile: "offensive",
      profile_decision_source: "initial", profile_source_round_id: null, overall_traits: ["offensive"],
      overall_seed_mode: "observed", is_goalkeeper: false, member_category: "guest", is_selectable: true,
      is_competitive_profile_complete: false, show_fitness_stats: false, registration_source: "admin",
      profile_scope: "persistent", created_by_user_id: null, created_at: "2026-10-20T10:00:00.000Z",
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ player }), {
        status: 201, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ player: { ...player, nickname: "BQ" } }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ guests: [{
        createdName: "Ana", playerId, addedToCallup: true,
      }] }), { status: 201, headers: { "content-type": "application/json" } }));
    const gateway = httpRosterGateway("http://backend:3001", "token", fetcher as typeof fetch);
    await expect(gateway.createPlayer(leagueId, { name: "Convidado", member_category: "guest" }))
      .resolves.toEqual(player);
    await expect(gateway.updatePlayer(leagueId, playerId, { nickname: "BQ" }))
      .resolves.toMatchObject({ nickname: "BQ" });
    await expect(gateway.swapPlayerAvatars(leagueId, playerId)).resolves.toBeUndefined();
    await expect(gateway.importGuestRoster(leagueId, ["Ana"])).resolves.toHaveLength(1);
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
    expect((fetcher.mock.calls[1]?.[1] as RequestInit).method).toBe("PATCH");
    expect((fetcher.mock.calls[2]?.[0] as URL).pathname).toContain("/swap-avatars");
    expect((fetcher.mock.calls[3]?.[1] as RequestInit).body).toBe(JSON.stringify({ names: ["Ana"] }));
  });

  it("loads administrative registration history and merge candidates", async () => {
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const guestId = "00000000-0000-4000-8000-000000000001";
    const event = {
      id: 1, player_id: guestId, player_name: "Convidado", avatar_url: null,
      member_category: "guest", source: "admin", created_by_user_id: null,
      created_at: "2026-10-20T10:00:00.000Z",
    };
    const player = {
      id: "00000000-0000-4000-8000-000000000002", name: "Atleta", nickname: null,
      profile_bio: null, avatar_url: null, avatar_alternate_url: null, player_profile: "offensive",
      initial_player_profile: "offensive", profile_decision_source: "initial", profile_source_round_id: null,
      overall_traits: ["offensive"], overall_seed_mode: "observed", is_goalkeeper: false,
      member_category: "player", is_selectable: true, is_competitive_profile_complete: false,
      show_fitness_stats: false, registration_source: "site_signup", profile_scope: "persistent",
      created_by_user_id: null, created_at: "2026-10-20T10:00:00.000Z",
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [event] }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ players: [player] }), {
        status: 200, headers: { "content-type": "application/json" },
      }));
    const gateway = httpRosterGateway("http://backend:3001", "token", fetcher as typeof fetch);
    await expect(gateway.getRegistrationHistory(leagueId)).resolves.toEqual([event]);
    await expect(gateway.getRegisteredMergeCandidates(leagueId, guestId)).resolves.toEqual([player]);
    expect((fetcher.mock.calls[0]?.[0] as URL).pathname).toContain("/registrations");
    expect((fetcher.mock.calls[1]?.[0] as URL).pathname).toContain("/merge-candidates");
  });

  it("loads player playtime and goals grouped by club", async () => {
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const playerId = "00000000-0000-4000-8000-000000000001";
    const playtime = { totalSeconds: 120, officialSeconds: 90, friendlySeconds: 30 };
    const clubs = [{ key: "club", name: "Clube", color: "#fff", crestUrl: null,
      officialGoals: 2, friendlyGoals: 1, totalGoals: 3 }];
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ playtime }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ clubs }), {
        status: 200, headers: { "content-type": "application/json" },
      }));
    const gateway = httpRosterGateway("http://backend:3001", "token", fetcher as typeof fetch);
    await expect(gateway.getPlayerPlaytime(leagueId, playerId)).resolves.toEqual(playtime);
    await expect(gateway.getPlayerGoalsByClub(leagueId, playerId)).resolves.toEqual(clubs);
    expect((fetcher.mock.calls[0]?.[0] as URL).pathname).toContain("/playtime");
    expect((fetcher.mock.calls[1]?.[0] as URL).pathname).toContain("/club-goals");
  });

  it("loads monthly awards, achievement belts and previous winners", async () => {
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const playerId = "00000000-0000-4000-8000-000000000001";
    const award = { type: "goldenBootMonth", periodStart: "2026-09-01", points: 8,
      roundsPlayed: 4, isFinal: true, metricValue: 6 };
    const belt = { slug: "top_scorer", name: "Artilheiro", description: "Recorde", recordValue: 4,
      unit: "gols", scope: "player", roundId: "round-1", roundNumber: 2,
      roundDate: "2026-09-02", team: null };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ awards: [award] }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ belts: [belt] }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ winners: [{ ...award,
        playerId, playerName: "Ana", avatarUrl: null }] }), {
        status: 200, headers: { "content-type": "application/json" },
      }));
    const gateway = httpRosterGateway("http://backend:3001", "token", fetcher as typeof fetch);
    await expect(gateway.getPlayerMonthlyAwards(leagueId, playerId)).resolves.toEqual([award]);
    await expect(gateway.getPlayerAchievementBelts(leagueId, playerId)).resolves.toEqual([belt]);
    await expect(gateway.getMonthlyAwardWinners(leagueId, "2026-09-01"))
      .resolves.toMatchObject([{ playerName: "Ana" }]);
    expect((fetcher.mock.calls[2]?.[0] as URL).searchParams.get("period_start")).toBe("2026-09-01");
  });

  it("loads player round history and seasonal award groups", async () => {
    const leagueId = "00000000-0000-4000-8000-000000000010";
    const playerId = "00000000-0000-4000-8000-000000000001";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ history: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ seasons: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      }));
    const gateway = httpRosterGateway("http://backend:3001", "token", fetcher as typeof fetch);
    await expect(gateway.getPlayerRoundHistory(leagueId, playerId, "friendly")).resolves.toEqual([]);
    await expect(gateway.getPlayerAwardSeasons(leagueId, playerId)).resolves.toEqual([]);
    expect((fetcher.mock.calls[0]?.[0] as URL).searchParams.get("round_type")).toBe("friendly");
    expect((fetcher.mock.calls[1]?.[0] as URL).pathname).toContain("/award-seasons");
  });
});
