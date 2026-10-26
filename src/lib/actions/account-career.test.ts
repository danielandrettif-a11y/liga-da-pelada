import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ account: vi.fn(), rosterApi: vi.fn(), getCareer: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("@/modules/roster/infrastructure/roster-api-session", () => ({ rosterApiFor: mocks.rosterApi }));

import { getMyAccountCareer } from "./account-career";

const totals = {
  rounds_count: 1, games: 2, goals: 3, assists: 1, wins: 1, draws: 0, losses: 1, points: 3,
  goalkeeper_games: 0, goals_conceded: 0, clean_sheets: 0, play_seconds: 600,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({ user: { id: "user-1" }, client: { rpc: vi.fn() } });
  mocks.rosterApi.mockResolvedValue({ getMyAccountCareer: mocks.getCareer });
});

describe("getMyAccountCareer", () => {
  it("uses the roster backend when its migration flag is enabled", async () => {
    const career = { rows: [], overall: totals, official: totals, friendly: totals };
    mocks.getCareer.mockResolvedValue(career);
    await expect(getMyAccountCareer()).resolves.toEqual(career);
    expect(mocks.getCareer).toHaveBeenCalledOnce();
  });

  it("keeps an empty compatible projection for anonymous or unavailable accounts", async () => {
    mocks.account.mockResolvedValueOnce({ user: null, client: { rpc: vi.fn() } });
    await expect(getMyAccountCareer()).resolves.toMatchObject({ rows: [], overall: { goals: 0 } });
    mocks.getCareer.mockRejectedValueOnce(new Error("backend unavailable"));
    await expect(getMyAccountCareer()).resolves.toMatchObject({ rows: [], overall: { goals: 0 } });
  });

  it("retains the direct Supabase fallback while the flag is disabled", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ league_id: "league-1", league_name: "Pelada", round_type: "official", ...totals }], error: null,
    });
    mocks.account.mockResolvedValue({ user: { id: "user-1" }, client: { rpc } });
    mocks.rosterApi.mockResolvedValue(null);
    await expect(getMyAccountCareer()).resolves.toMatchObject({ overall: { goals: 3 }, friendly: { goals: 0 } });
    expect(rpc).toHaveBeenCalledWith("get_my_account_career_stats");
  });
});
