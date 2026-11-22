import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectedLeague: vi.fn(),
  matchApi: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("@/modules/matches/infrastructure/match-api-session", () => ({ matchApiFor: mocks.matchApi }));

import { selectBestGoalkeeper } from "./goalkeeper";

const leagueId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const playerId = "00000000-0000-4000-8000-000000000003";

describe("goalkeeper actions via API gateway", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.selectedLeague.mockResolvedValue({ id: leagueId, role: "admin" });
  });

  it("routes selectBestGoalkeeper to API gateway", async () => {
    mocks.matchApi.mockResolvedValue({
      selectBestGoalkeeper: vi.fn().mockResolvedValue({ success: false, error: "Removido" }),
    });

    const res = await selectBestGoalkeeper(roundId, playerId);
    expect(res).toEqual({ success: false, error: "Removido" });
  });

  it("returns compatibility fallback when API is disabled", async () => {
    mocks.matchApi.mockResolvedValue(null);

    const res = await selectBestGoalkeeper(roundId, playerId);
    expect(res.success).toBe(false);
    expect(res.error).toContain("removido");
  });
});
