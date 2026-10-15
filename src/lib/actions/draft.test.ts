import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminClient: vi.fn(),
  account: vi.fn(),
  selectedLeague: vi.fn(),
  rpc: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({
  getAdminClient: mocks.adminClient,
  getCurrentAccount: mocks.account,
}));
vi.mock("@/lib/league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));

import { startTeamDraft } from "./draft";

beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: vi.fn(), eq: mocks.eq, maybeSingle: mocks.maybeSingle };
  query.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.adminClient.mockResolvedValue({ from: vi.fn().mockReturnValue(query), rpc: mocks.rpc });
  mocks.selectedLeague.mockResolvedValue({ id: "league-a", role: "admin" });
  mocks.rpc.mockResolvedValue({ error: null });
});

describe("Draft de uma pelada selecionada", () => {
  it("nao chama a RPC para um Draft de outra pelada", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });
    expect((await startTeamDraft("draft-b")).success).toBe(false);
    expect(mocks.eq).toHaveBeenCalledWith("league_id", "league-a");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("permite iniciar somente o Draft encontrado na pelada selecionada", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "draft-a", round_id: "round-a" } });
    expect(await startTeamDraft("draft-a")).toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("start_team_draft", { p_draft_id: "draft-a" });
  });
});
