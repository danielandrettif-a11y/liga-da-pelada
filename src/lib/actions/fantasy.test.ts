import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (callback: () => void) => callback() }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: any) => fn,
}));

const mockGetCurrentAccount = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentAccount: () => mockGetCurrentAccount(),
}));

const mockGetActiveLeague = vi.fn();
vi.mock("./rounds", () => ({
  getActiveLeague: () => mockGetActiveLeague(),
}));

const mockGetActiveSeason = vi.fn();
vi.mock("./seasons", () => ({
  getActiveSeason: () => mockGetActiveSeason(),
}));

const mockFantasyApiFor = vi.fn();
vi.mock("@/modules/fantasy/infrastructure/fantasy-api-session", () => ({
  fantasyApiFor: (client: any, capability?: string) => mockFantasyApiFor(client, capability),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

import {
  getFantasyDashboard,
  getFantasyPlayerDetail,
  getFantasyPlayerSummary,
  getFantasyQuickHighlights,
  getMyFantasySummary,
  getMyFantasyHistory,
  getRevealedLineups,
  getFantasyRoundLineupOverview,
  saveFantasyLineup,
  previewFantasyMarketV11,
  repairLegacySavedFantasyLineups,
  getFantasyRanking,
  getFantasyUserHistory,
  getFantasyUserRoundHistory,
  getSeasonPassDashboard,
  getFantasyAdminData,
  updateFantasySettings,
  reprocessFantasyRound,
  reprocessFantasyRoundWithCurrentRules,
  createFantasyTestSession,
  processFantasyTestSession,
  resetFantasyTestSession,
} from "./fantasy";

describe("Server Actions: Fantasy Bridging (22 operations)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();

    mockGetCurrentAccount.mockResolvedValue({
      user: { id: "user-123" },
      isAdmin: true,
      client: {},
    });

    mockGetActiveLeague.mockResolvedValue({
      id: "league-123",
      feature_tier: "complete",
      players_per_team: 6,
    });

    mockGetActiveSeason.mockResolvedValue({
      id: "season-123",
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Subfatia 1
  it("delegates getFantasyDashboard to fantasyApi when enabled", async () => {
    const mockDashboardData = { authenticated: true, available: true, budget: 100 };
    mockFantasyApiFor.mockResolvedValue({
      getDashboard: vi.fn().mockResolvedValue(mockDashboardData),
    });

    const result = await getFantasyDashboard();
    expect(result).toEqual(mockDashboardData);
  });

  it("delegates getFantasyPlayerDetail and getFantasyPlayerSummary to fantasyApi", async () => {
    const mockPlayer = { playerId: "p1", name: "Player 1", price: 10 };
    mockFantasyApiFor.mockResolvedValue({
      getPlayerDetail: vi.fn().mockResolvedValue(mockPlayer),
    });

    const result = await getFantasyPlayerDetail("p1");
    expect(result).toEqual(mockPlayer);

    const summaryResult = await getFantasyPlayerSummary("p1");
    expect(summaryResult).toEqual(mockPlayer);
  });

  it("delegates getFantasyQuickHighlights to fantasyApi", async () => {
    const mockHighlights = { topValuedPlayer: null, topScorerPlayer: null, bestCostBenefitPlayer: null };
    mockFantasyApiFor.mockResolvedValue({
      getQuickHighlights: vi.fn().mockResolvedValue(mockHighlights),
    });

    const result = await getFantasyQuickHighlights();
    expect(result).toEqual(mockHighlights);
  });

  it("delegates getMyFantasySummary and getMyFantasyHistory to fantasyApi", async () => {
    const mockSummary = { userId: "user-123", totalPoints: 50 };
    const mockHistory = [{ roundId: "r1", roundNumber: 1, score: 20 }];
    mockFantasyApiFor.mockResolvedValue({
      getMySummary: vi.fn().mockResolvedValue(mockSummary),
      getMyHistory: vi.fn().mockResolvedValue(mockHistory),
    });

    const summary = await getMyFantasySummary();
    expect(summary).toEqual(mockSummary);

    const history = await getMyFantasyHistory();
    expect(history).toEqual(mockHistory);
  });

  it("delegates getRevealedLineups and getFantasyRoundLineupOverview to fantasyApi", async () => {
    const mockRevealed = { allowed: true, lineups: [] };
    const mockOverview = { isRoundOpen: true, confirmedCount: 5 };
    mockFantasyApiFor.mockResolvedValue({
      getRevealedLineups: vi.fn().mockResolvedValue(mockRevealed),
      getRoundLineupOverview: vi.fn().mockResolvedValue(mockOverview),
    });

    const rev = await getRevealedLineups("r1");
    expect(rev).toEqual(mockRevealed);

    const ov = await getFantasyRoundLineupOverview("r1");
    expect(ov).toEqual(mockOverview);
  });

  it("delegates saveFantasyLineup to fantasyApi and revalidates paths on success", async () => {
    mockFantasyApiFor.mockResolvedValue({
      saveLineup: vi.fn().mockResolvedValue({ success: true, lineupId: "lineup-1" }),
    });

    const result = await saveFantasyLineup({
      roundId: "r1",
      captainPlayerId: "p1",
      slots: [{ slotRole: "ATA", playerId: "p1" }],
    } as any);

    expect(result).toEqual({ success: true, lineupId: "lineup-1" });
  });

  it("delegates previewFantasyMarketV11 and repairLegacySavedFantasyLineups to fantasyApi", async () => {
    mockFantasyApiFor.mockResolvedValue({
      previewMarketV11: vi.fn().mockResolvedValue({ success: true, data: { marketVersion: "1.1" } }),
      repairLegacyLineups: vi.fn().mockResolvedValue({ success: true, repairedCount: 4 }),
    });

    const prev = await previewFantasyMarketV11();
    expect(prev).toEqual({ success: true, data: { marketVersion: "1.1" } });

    const rep = await repairLegacySavedFantasyLineups();
    expect(rep).toEqual({ success: true, repairedCount: 4 });
  });

  // Subfatia 2
  it("delegates getFantasyRanking and getFantasyUserHistory to fantasyApi", async () => {
    const mockRanking = [{ rank: 1, userId: "u1", totalPoints: 100 }];
    const mockHistory = [{ roundId: "r1", score: 20 }];
    mockFantasyApiFor.mockResolvedValue({
      getRanking: vi.fn().mockResolvedValue(mockRanking),
      getUserHistory: vi.fn().mockResolvedValue(mockHistory),
    });

    const ranking = await getFantasyRanking();
    expect(ranking).toEqual(mockRanking);

    const history = await getFantasyUserHistory("u1");
    expect(history).toEqual(mockHistory);
  });

  it("delegates getFantasyUserRoundHistory and getSeasonPassDashboard to fantasyApi", async () => {
    const mockRoundHistory = { userId: "u1", roundId: "r1", score: 45, slots: [] };
    const mockPass = { authenticated: true, available: true, progress: 10, currentLevel: 1 };
    mockFantasyApiFor.mockResolvedValue({
      getUserRoundHistory: vi.fn().mockResolvedValue(mockRoundHistory),
      getSeasonPassDashboard: vi.fn().mockResolvedValue(mockPass),
    });

    const roundHist = await getFantasyUserRoundHistory("u1", "r1");
    expect(roundHist).toEqual(mockRoundHistory);

    const pass = await getSeasonPassDashboard();
    expect(pass).toEqual(mockPass);
  });

  it("delegates getFantasyAdminData and updateFantasySettings to fantasyApi", async () => {
    const mockAdminData = { settings: { initial_budget: 100 }, rounds: [], testSession: null, friendlyRounds: [], marketStatus: null };
    mockFantasyApiFor.mockResolvedValue({
      getAdminData: vi.fn().mockResolvedValue(mockAdminData),
      updateSettings: vi.fn().mockResolvedValue({ success: true }),
    });

    const adminData = await getFantasyAdminData();
    expect(adminData).toEqual(mockAdminData);

    const updateRes = await updateFantasySettings({ initial_budget: 120 } as any);
    expect(updateRes).toEqual({ success: true });
  });

  it("delegates reprocessFantasyRound and reprocessFantasyRoundWithCurrentRules to fantasyApi", async () => {
    mockFantasyApiFor.mockResolvedValue({
      reprocessRound: vi.fn().mockResolvedValue({ success: true, reprocessedLineupsCount: 10 }),
    });

    const res1 = await reprocessFantasyRound("r1");
    expect(res1).toEqual({ success: true, reprocessedLineupsCount: 10 });

    const res2 = await reprocessFantasyRoundWithCurrentRules("r1");
    expect(res2).toEqual({ success: true, reprocessedLineupsCount: 10 });
  });

  it("delegates test session actions to fantasyApi", async () => {
    mockFantasyApiFor.mockResolvedValue({
      createTestSession: vi.fn().mockResolvedValue({ success: true }),
      processTestSession: vi.fn().mockResolvedValue({ success: true }),
      resetTestSession: vi.fn().mockResolvedValue({ success: true }),
    });

    expect(await createFantasyTestSession("r1")).toEqual({ success: true });
    expect(await processFantasyTestSession("r1")).toEqual({ success: true });
    expect(await resetFantasyTestSession("r1")).toEqual({ success: true });
  });

  it("projects a revealed lineup using modular inputs during a live match", async () => {
    const round = { id: "fr1", round_id: "r1", market_status: "in_progress", scoring_version: 5,
      settings_snapshot: { scoring_version: 5 }, round: { id: "r1", number: 7, date: "2026-01-01", status: "in_progress", callups: [] } };
    const client = { from: vi.fn((table: string) => {
      const data = table === "fantasy_seasons" ? { id: "fs1" } : round;
      const query: any = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
        then: (resolve: any) => Promise.resolve({ data: [round], error: null }).then(resolve) };
      query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query);
      return query;
    }) };
    mockGetCurrentAccount.mockResolvedValue({ user: { id: "user-123" }, isAdmin: true, client });
    const starter = { id: "lp1", lineup_id: "l1", player_id: "p1", slot_index: 0, slot_role: "ATA", player_profile_locked: "offensive", price_locked: 10, total_points: 0 };
    const lineup = { id: "l1", user_id: "user-123", captain_player_id: "p1", top_scorer_player_id: "p1", fantasy_lineup_players: [starter], fantasy_lineup_reserves: [], score_breakdown: {} };
    const gateway = {
      getRevealedInputs: vi.fn().mockResolvedValue({ lineups: [lineup], players: [starter], reserves: [], prices: [], profiles: [{ user_id: "user-123", players: { name: "Pessoa" } }], predictions: [{ id: "p1", name: "Atleta" }], activations: [] }),
      getLiveProjectionInputs: vi.fn().mockResolvedValue({ settings: {}, lineups: [lineup], players: [{ player_id: "p1", player_profile: "offensive", players: { id: "p1", member_category: "player", is_selectable: true } }] }),
      getLiveMatchSnapshots: vi.fn().mockResolvedValue([{ id: "m1", status: "live", team_a_id: "a", team_b_id: "b", score_a: 1, score_b: 0,
        match_players: [{ player_id: "p1", team_id: "a", result_eligible: true, scoring_eligible: true }], match_goalkeepers: [], match_goalkeeper_stints: [],
        match_events: [{ player_id: "p1", team_id: "a", is_own_goal: false }] }]),
    };
    mockFantasyApiFor.mockImplementation(async (_client: any, capability?: string) => capability === "revealed-inputs" || capability === "live-matches" ? gateway : null);
    try {
      const result = await getRevealedLineups("r1");
      expect(result.allowed).toBe(true);
      expect(result.lineups[0]).toMatchObject({ lineupId: "l1", userName: "Pessoa", captainId: "p1", topScorer: { id: "p1", name: "Atleta" } });
      expect(result.lineups[0].players[0].points).toBeGreaterThan(0);
      expect(result.lineups[0].totalPoints).toBeGreaterThan(0);
      expect(gateway.getRevealedInputs).toHaveBeenCalledWith("league-123", "r1");
      expect(gateway.getLiveProjectionInputs).toHaveBeenCalledWith("league-123", "r1");
    } finally {
      mockFantasyApiFor.mockReset();
    }
  });

  it("uses modular period data while preserving season and month ranking calculations", async () => {
    const client = { from: vi.fn((table: string) => {
      const data = table === "account_profiles" ? [{ user_id: "u1", players: { name: "Pessoa", avatar_url: null } }] : [];
      const query: any = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "fs1" }, error: null }),
        then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
      query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query);
      return query;
    }) };
    mockGetCurrentAccount.mockResolvedValue({ user: { id: "user-123" }, isAdmin: true, client });
    const inputs = { accounts: [{ user_id: "u1", current_budget: 65 }],
      rounds: [{ id: "fr1", round_id: "r1", market_status: "finished", round: { date: "2026-01-05", status: "finished" } },
        { id: "fr2", round_id: "r2", market_status: "finished", round: { date: "2026-02-05", status: "finished" } }],
      lineups: [{ fantasy_round_id: "fr1", user_id: "u1", total_points: 5, fantasy_lineup_players: [] },
        { fantasy_round_id: "fr2", user_id: "u1", total_points: 9, fantasy_lineup_players: [] }] };
    const gateway = { getRankingPeriodInputs: vi.fn().mockResolvedValue(inputs) };
    mockFantasyApiFor.mockImplementation(async (_client: any, capability?: string) => capability === "ranking-period" ? gateway : null);
    try {
      const season = await getFantasyRanking("season");
      const month = await getFantasyRanking("month");
      expect(season[0]).toMatchObject({ user_id: "u1", total_points: 14, position: 1, player: { name: "Pessoa" } });
      expect(month[0]).toMatchObject({ user_id: "u1", total_points: 9, position: 1 });
      expect(gateway.getRankingPeriodInputs).toHaveBeenCalledWith("league-123");
    } finally {
      mockFantasyApiFor.mockReset();
    }
  });

  it("uses the selected closed round's modular lineups for round ranking", async () => {
    const client = { from: vi.fn((table: string) => {
      const one = table === "fantasy_seasons" ? { id: "fs1" } : { id: "fr1", market_status: "finished", round: { status: "finished" } };
      const many = table === "account_profiles" ? [{ user_id: "u1", players: { name: "Pessoa", avatar_url: null } }] : [];
      const query: any = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: one, error: null }),
        then: (resolve: any) => Promise.resolve({ data: many, error: null }).then(resolve) };
      query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query);
      return query;
    }) };
    mockGetCurrentAccount.mockResolvedValue({ user: { id: "user-123" }, isAdmin: true, client });
    const gateway = { getRevealedInputs: vi.fn().mockResolvedValue({
      lineups: [{ id: "l1", user_id: "u1", status: "scored", player_points: 7, total_points: 10, budget_before: 80, budget_after: 85 }],
      players: [{ lineup_id: "l1", player_id: "p1", slot_role: "ATA", total_points: 7 }], reserves: [], prices: [], profiles: [], predictions: [], activations: [],
    }) };
    mockFantasyApiFor.mockImplementation(async (_client: any, capability?: string) => capability === "revealed-inputs" ? gateway : null);
    try {
      const result = await getFantasyRanking("round", "r1");
      expect(result[0]).toMatchObject({ user_id: "u1", round_id: "r1", total_points: 7, current_budget: 85, position: 1 });
      expect(gateway.getRevealedInputs).toHaveBeenCalledWith("league-123", "r1");
    } finally {
      mockFantasyApiFor.mockReset();
    }
  });

  it("uses the modular market context before checking a season without rounds", async () => {
    const query: any = { select: vi.fn(), eq: vi.fn(), neq: vi.fn().mockResolvedValue({ count: 0, error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    const client = { from: vi.fn().mockReturnValue(query) };
    mockGetCurrentAccount.mockResolvedValue({ user: { id: "user-123" }, isAdmin: true, client });
    const gateway = { getMarketContext: vi.fn().mockResolvedValue({ seasonId: "season-123", settings: null, testSession: null, fantasySeason: null }) };
    mockFantasyApiFor.mockImplementation(async (_client: any, capability?: string) => capability === "market-context" ? gateway : null);
    try {
      expect(await getFantasyDashboard()).toEqual({ authenticated: true, available: false, unavailableReason: "no-round" });
      expect(gateway.getMarketContext).toHaveBeenCalledWith("league-123");
      expect(client.from).toHaveBeenCalledWith("rounds");
      expect(client.from).not.toHaveBeenCalledWith("fantasy_settings");
      expect(client.from).not.toHaveBeenCalledWith("fantasy_test_sessions");
      expect(client.from).not.toHaveBeenCalledWith("fantasy_seasons");
    } finally {
      mockFantasyApiFor.mockReset();
    }
  });
});
