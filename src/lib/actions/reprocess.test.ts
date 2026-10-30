import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ account: vi.fn(), league: vi.fn(), session: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("./rounds", () => ({ getActiveLeague: mocks.league }));
vi.mock("@/modules/statistics/infrastructure/statistics-api-session", () => ({ getStatisticsApiSession: mocks.session }));

import { executeReprocessSeason, previewReprocessSeason } from "./reprocess";

describe("season reprocessing actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.account.mockResolvedValue({ isAdmin: true, client: {} });
    mocks.league.mockResolvedValue({ id: "league-1" });
  });

  it("routes preview and execution through the API without legacy fallback", async () => {
    const gateway = {
      previewReprocessSeason: vi.fn().mockResolvedValue({ can_reprocess: true }),
      executeReprocessSeason: vi.fn().mockResolvedValue({ success: true }),
    };
    mocks.session.mockResolvedValue({ gateway });
    await expect(previewReprocessSeason()).resolves.toEqual({ can_reprocess: true });
    await expect(executeReprocessSeason()).resolves.toEqual({ success: true });
    expect(gateway.previewReprocessSeason).toHaveBeenCalledWith("league-1");
    expect(gateway.executeReprocessSeason).toHaveBeenCalledWith("league-1");
    expect(mocks.revalidate).toHaveBeenCalledWith("/ranking");
  });

  it("keeps the legacy error-shaped contracts when the API fails", async () => {
    mocks.session.mockResolvedValue({ gateway: {
      previewReprocessSeason: vi.fn().mockRejectedValue(new Error("offline")),
      executeReprocessSeason: vi.fn().mockRejectedValue(new Error("offline")),
    } });
    await expect(previewReprocessSeason()).resolves.toEqual({ can_reprocess: false, reason: "offline" });
    await expect(executeReprocessSeason()).resolves.toEqual({ success: false, error: "offline" });
  });
});
