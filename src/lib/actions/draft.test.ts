import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  adminClient: vi.fn(),
  selectedLeague: vi.fn(),
  revalidatePath: vi.fn(),
  roundApi: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("../auth", () => ({
  getCurrentAccount: mocks.account,
  getAdminClient: mocks.adminClient,
}));
vi.mock("../league-context", () => ({ getSelectedLeague: mocks.selectedLeague }));
vi.mock("@/modules/rounds/infrastructure/round-api-session", () => ({ roundApiFor: mocks.roundApi }));

import {
  applyDraftSwap,
  createTeamDraft,
  finalizeTeamDraft,
  getDraftWorkspace,
  getDraftWorkspaceByRound,
  makeTeamDraftPick,
  replaceTeamDraftCaptain,
  restartTeamDraft,
  startTeamDraft,
} from "./draft";

const leagueId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const draftId = "00000000-0000-4000-8000-000000000003";

describe("draft actions via API gateway", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: draftId, league_id: leagueId } }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: draftId, league_id: leagueId } }),
          }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: draftId, error: null }),
    };

    mocks.account.mockResolvedValue({
      user: { id: "user-123" },
      isAdmin: true,
      client,
    });
    mocks.adminClient.mockResolvedValue(client);
    mocks.selectedLeague.mockResolvedValue({ id: leagueId, role: "admin" });
  });

  it("routes getDraftWorkspace to API gateway", async () => {
    const mockWs = { id: draftId, status: "setup" } as any;
    mocks.roundApi.mockResolvedValue({
      getDraftWorkspace: vi.fn().mockResolvedValue(mockWs),
    });

    const res = await getDraftWorkspace(draftId);
    expect(res).toEqual(mockWs);
  });

  it("routes getDraftWorkspaceByRound to API gateway", async () => {
    const mockWs = { id: draftId, roundId, status: "active" } as any;
    mocks.roundApi.mockResolvedValue({
      getDraftWorkspaceByRound: vi.fn().mockResolvedValue(mockWs),
    });

    const res = await getDraftWorkspaceByRound(roundId);
    expect(res).toEqual(mockWs);
  });

  it("routes createTeamDraft to API gateway", async () => {
    mocks.roundApi.mockResolvedValue({
      createTeamDraft: vi.fn().mockResolvedValue({ success: true, draftId }),
    });

    const res = await createTeamDraft({ roundId });
    expect(res).toEqual({ success: true, draftId });
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("routes startTeamDraft to API gateway", async () => {
    mocks.roundApi.mockResolvedValue({
      startTeamDraft: vi.fn().mockResolvedValue({ success: true }),
    });

    const res = await startTeamDraft(draftId);
    expect(res).toEqual({ success: true });
  });

  it("routes restartTeamDraft to API gateway", async () => {
    mocks.roundApi.mockResolvedValue({
      restartTeamDraft: vi.fn().mockResolvedValue({ success: true }),
    });

    const res = await restartTeamDraft(draftId);
    expect(res).toEqual({ success: true });
  });

  it("routes replaceTeamDraftCaptain to API gateway", async () => {
    mocks.roundApi.mockResolvedValue({
      replaceTeamDraftCaptain: vi.fn().mockResolvedValue({ success: true }),
    });

    const res = await replaceTeamDraftCaptain(draftId, 1, "player-1");
    expect(res).toEqual({ success: true });
  });

  it("routes makeTeamDraftPick to API gateway", async () => {
    mocks.roundApi.mockResolvedValue({
      makeTeamDraftPick: vi.fn().mockResolvedValue({ success: true }),
    });

    const res = await makeTeamDraftPick(draftId, "player-2");
    expect(res).toEqual({ success: true });
  });

  it("routes applyDraftSwap to API gateway", async () => {
    mocks.roundApi.mockResolvedValue({
      applyDraftSwap: vi.fn().mockResolvedValue({ success: true }),
    });

    const res = await applyDraftSwap(draftId, "p1", "p2");
    expect(res).toEqual({ success: true });
  });

  it("routes finalizeTeamDraft to API gateway", async () => {
    mocks.roundApi.mockResolvedValue({
      finalizeTeamDraft: vi.fn().mockResolvedValue({ success: true, roundId }),
    });

    const res = await finalizeTeamDraft(draftId);
    expect(res).toEqual({ success: true, roundId });
  });
});
