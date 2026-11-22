import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getLeague: vi.fn(), getSeason: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/statistics/infrastructure/statistics-api-session", () => ({ getStatisticsApiSession: mocks.getSession }));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.getLeague }));
vi.mock("./seasons", () => ({ getActiveSeason: mocks.getSeason }));
vi.mock("../supabase/server", () => ({ createClient: vi.fn() }));

import { getSeasonTeamStandings } from "./team-standings";

describe("getSeasonTeamStandings", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.getLeague.mockResolvedValue({ id: "league-1" }); });

  it("uses the statistics API when enabled", async () => {
    const rows = [{ name: "MilamB", points: 3 }];
    const gateway = { getSeasonTeamStandings: vi.fn().mockResolvedValue(rows) };
    mocks.getSession.mockResolvedValue({ gateway });
    await expect(getSeasonTeamStandings()).resolves.toEqual(rows);
    expect(gateway.getSeasonTeamStandings).toHaveBeenCalledWith("league-1");
  });
});
