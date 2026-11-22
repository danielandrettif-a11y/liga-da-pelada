import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: any) => fn,
}));

const mockGetCurrentAccount = vi.fn();
const mockGetAdminClient = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentAccount: () => mockGetCurrentAccount(),
  getAdminClient: () => mockGetAdminClient(),
}));

const mockGetActiveLeague = vi.fn();
vi.mock("./rounds", () => ({
  getActiveLeague: () => mockGetActiveLeague(),
}));

const mockCardsApiFor = vi.fn();
vi.mock("@/modules/cards/infrastructure/cards-api-session", () => ({
  cardsApiFor: (client: any) => mockCardsApiFor(client),
}));

import {
  getMyPacks,
  restoreMyPassPacks,
  openPack,
  claimPackCard,
  getMyInventory,
  getMyInventoryCount,
  getActiveCardForRound,
  activateCardForRound,
  removeActiveCardForRound,
  generatePacksForFinishedRound,
  giveMyAccountTestPack,
  resetMyAccountCards,
  distributePackToAllLineupUsers,
  auditAndRepairCurrentSeasonPacks,
  grantFantasyPackToUser,
} from "./fantasy-cards";

describe("Server Actions: Fantasy Cards Bridging (15 operations)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();

    mockGetCurrentAccount.mockResolvedValue({
      user: { id: "user-123" },
      isAdmin: true,
      client: {},
    });

    mockGetAdminClient.mockResolvedValue({});

    mockGetActiveLeague.mockResolvedValue({
      id: "league-123",
      feature_tier: "complete",
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("delegates getMyPacks to cardsApi", async () => {
    const mockPacks = { availablePacks: [], claimedCount: 1, totalPacks: 1 };
    mockCardsApiFor.mockResolvedValue({
      getMyPacks: vi.fn().mockResolvedValue(mockPacks),
    });

    const result = await getMyPacks();
    expect(result).toEqual(mockPacks);
  });

  it("delegates restoreMyPassPacks to cardsApi", async () => {
    mockCardsApiFor.mockResolvedValue({
      restoreMyPassPacks: vi.fn().mockResolvedValue({ success: true }),
    });

    const result = await restoreMyPassPacks("season-pass-1");
    expect(result).toEqual({ success: true });
  });

  it("delegates openPack and claimPackCard to cardsApi", async () => {
    mockCardsApiFor.mockResolvedValue({
      openPack: vi.fn().mockResolvedValue({ success: true, offers: [] }),
      claimPackCard: vi.fn().mockResolvedValue({ success: true }),
    });

    expect(await openPack("pack-1")).toEqual({ success: true, offers: [] });
    expect(await claimPackCard("pack-1", "slug-1")).toEqual({ success: true });
  });

  it("delegates getMyInventory and getMyInventoryCount to cardsApi", async () => {
    mockCardsApiFor.mockResolvedValue({
      getMyInventory: vi.fn().mockResolvedValue({ cards: [{ status: "available" }], groupedBySlug: {} }),
      getMyInventoryCount: vi.fn().mockResolvedValue({ count: 4 }),
    });

    const inv = await getMyInventory();
    expect(inv.availableCount).toBe(1);

    const count = await getMyInventoryCount();
    expect(count).toBe(4);
  });

  it("delegates getActiveCardForRound, activateCardForRound and removeActiveCardForRound to cardsApi", async () => {
    mockCardsApiFor.mockResolvedValue({
      getActiveCardForRound: vi.fn().mockResolvedValue({ id: "ac1", cardSlug: "c1" }),
      activateCardForRound: vi.fn().mockResolvedValue({ success: true }),
      removeActiveCardForRound: vi.fn().mockResolvedValue({ success: true }),
    });

    expect(await getActiveCardForRound("r1")).toEqual({ id: "ac1", cardSlug: "c1" });
    expect(await activateCardForRound({ roundId: "r1", userCardId: "uc1" })).toEqual({ success: true });
    expect(await removeActiveCardForRound("r1")).toEqual({ success: true });
  });

  it("delegates admin card operations to cardsApi", async () => {
    mockCardsApiFor.mockResolvedValue({
      generatePacksForFinishedRound: vi.fn().mockResolvedValue({ count: 8 }),
      giveMyAccountTestPack: vi.fn().mockResolvedValue({ success: true }),
      resetMyAccountCards: vi.fn().mockResolvedValue({ success: true }),
      distributePackToAllLineupUsers: vi.fn().mockResolvedValue({ success: true, awardedUsersCount: 10 }),
      auditAndRepairCurrentSeasonPacks: vi.fn().mockResolvedValue({ success: true }),
      grantFantasyPackToUser: vi.fn().mockResolvedValue({ success: true }),
    });

    expect(await generatePacksForFinishedRound("r1")).toBe(8);
    expect(await giveMyAccountTestPack()).toEqual({ success: true });
    expect(await resetMyAccountCards()).toEqual({ success: true });
    expect(await distributePackToAllLineupUsers()).toEqual({ success: true, awardedUsersCount: 10 });
    expect(await auditAndRepairCurrentSeasonPacks()).toEqual({ success: true });
    expect(await grantFantasyPackToUser("user-456")).toEqual({ success: true });
  });
});
