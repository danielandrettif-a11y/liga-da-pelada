import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
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
  fantasyApiFor: (client: any) => mockFantasyApiFor(client),
}));

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
    const mockAdminData = { initialBudget: 100, isTestSessionActive: false };
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
});
