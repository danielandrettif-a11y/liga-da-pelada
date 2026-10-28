import { describe, expect, it, vi } from "vitest";
import {
  closeCallup,
  joinCallup,
  leaveCallup,
  listActiveCallups,
  listAgendaCallups,
  lockCallup,
  openCallup,
  repairMyPlayerAccount,
  setCallupVisibility,
  updateCallup,
  type CallupRepository,
} from "./manage-callups.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const callupId = "00000000-0000-4000-8000-000000000001";
const roundId = "00000000-0000-4000-8000-000000000002";
const actor = { userId: "user-1" };

function repository(): CallupRepository {
  return {
    listActive: vi.fn().mockResolvedValue([]),
    listAgenda: vi.fn().mockResolvedValue([]),
    openCallup: vi.fn().mockResolvedValue({ callupId, roundId }),
    updateCallup: vi.fn().mockResolvedValue(undefined),
    closeCallup: vi.fn().mockResolvedValue(undefined),
    setVisibility: vi.fn().mockResolvedValue(undefined),
    lockCallup: vi.fn().mockResolvedValue(undefined),
    joinCallup: vi.fn().mockResolvedValue({ status: "confirmed", position: 1 }),
    leaveCallup: vi.fn().mockResolvedValue({ roundId: null }),
    addPlayer: vi.fn().mockResolvedValue({ status: "confirmed", position: 2 }),
    removePlayer: vi.fn().mockResolvedValue({ revalidateRoundId: null }),
    inviteGuest: vi.fn().mockResolvedValue({ playerId: "guest-1", status: "confirmed", position: 3 }),
    inviteGuestList: vi.fn().mockResolvedValue({ created: 1, confirmed: 1, waitlisted: 0, failed: [] }),
    createPrelist: vi.fn().mockResolvedValue({ roundId: "round-1", created: true }),
    repairMyPlayer: vi.fn().mockResolvedValue({ playerId: "player-1" }),
  };
}

describe("callups application services", () => {
  it("coordinates callup queries", async () => {
    const repo = repository();
    await expect(listActiveCallups(leagueId, actor, repo)).resolves.toEqual([]);
    await expect(listAgendaCallups(leagueId, actor, repo)).resolves.toEqual([]);
    expect(repo.listActive).toHaveBeenCalledWith(leagueId, actor, undefined);
    expect(repo.listAgenda).toHaveBeenCalledWith(leagueId, actor);
  });

  it("coordinates open and update lifecycle commands", async () => {
    const repo = repository();
    await expect(openCallup(leagueId, { date: "2026-11-01" }, actor, repo))
      .resolves.toEqual({ callupId, roundId });
    await expect(updateCallup(leagueId, callupId, { date: "2026-11-02" }, actor, repo))
      .resolves.toBeUndefined();
    await expect(closeCallup(leagueId, callupId, actor, repo)).resolves.toBeUndefined();
    await expect(setCallupVisibility(leagueId, callupId, true, actor, repo)).resolves.toBeUndefined();
    await expect(lockCallup(leagueId, callupId, actor, repo)).resolves.toBeUndefined();
    expect(repo.openCallup).toHaveBeenCalledWith(leagueId, expect.objectContaining({ date: "2026-11-01" }), actor);
    expect(repo.updateCallup).toHaveBeenCalledWith(leagueId, callupId, expect.objectContaining({ date: "2026-11-02" }), actor);
    expect(repo.closeCallup).toHaveBeenCalledWith(leagueId, callupId, actor);
    expect(repo.setVisibility).toHaveBeenCalledWith(leagueId, callupId, true, actor);
    expect(repo.lockCallup).toHaveBeenCalledWith(leagueId, callupId, actor);
  });

  it("coordinates participation and repair", async () => {
    const repo = repository();
    await expect(joinCallup(leagueId, callupId, actor, repo))
      .resolves.toEqual({ status: "confirmed", position: 1 });
    await expect(leaveCallup(leagueId, callupId, actor, repo))
      .resolves.toEqual({ roundId: null });
    await expect(repairMyPlayerAccount(actor, repo))
      .resolves.toEqual({ playerId: "player-1" });
    expect(repo.joinCallup).toHaveBeenCalledWith(leagueId, callupId, actor);
    expect(repo.leaveCallup).toHaveBeenCalledWith(leagueId, callupId, actor);
    expect(repo.repairMyPlayer).toHaveBeenCalledWith(actor);
  });
});
