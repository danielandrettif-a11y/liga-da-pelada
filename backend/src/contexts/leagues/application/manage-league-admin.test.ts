import { describe, expect, it, vi } from "vitest";
import {
  addExistingAccountToLeague,
  deleteLeague,
  reviewLeagueMembership,
  updateLeagueVisibility,
  upgradeLeague,
} from "./manage-league-admin.js";

const id = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("league admin use cases", () => {
  it("passes only validated identifiers and the verified actor", async () => {
    const repository = {
      reviewMembershipRequest: vi.fn().mockResolvedValue(true),
      addAccount: vi.fn().mockResolvedValue(true),
      setVisibility: vi.fn().mockResolvedValue(true),
      upgradeToComplete: vi.fn().mockResolvedValue(true),
      deletePermanently: vi.fn().mockResolvedValue(true),
    };
    await expect(reviewLeagueMembership(id, true, actor, repository)).resolves.toEqual({ reviewed: true });
    await expect(addExistingAccountToLeague(id, id, actor, repository)).resolves.toEqual({ added: true });
    await expect(updateLeagueVisibility(id, "open", actor, repository)).resolves.toEqual({ visibility: "open", updated: true });
    await expect(upgradeLeague(id, actor, repository)).resolves.toEqual({ upgraded: true });
    await expect(deleteLeague(id, "Pelada BQ", actor, repository)).resolves.toEqual({ deleted: true });
    expect(repository.reviewMembershipRequest).toHaveBeenCalledWith(id, true, actor);
    expect(repository.addAccount).toHaveBeenCalledWith(id, id, actor);
    expect(repository.setVisibility).toHaveBeenCalledWith(id, "open", actor);
    expect(repository.upgradeToComplete).toHaveBeenCalledWith(id, actor);
    expect(repository.deletePermanently).toHaveBeenCalledWith(id, "Pelada BQ", actor);
  });

  it("rejects invalid identifiers and visibility before persistence", async () => {
    const repository = {
      reviewMembershipRequest: vi.fn(), addAccount: vi.fn(), setVisibility: vi.fn(),
      upgradeToComplete: vi.fn(), deletePermanently: vi.fn(),
    };
    await expect(reviewLeagueMembership("invalid", true, actor, repository)).rejects.toThrow();
    await expect(addExistingAccountToLeague(id, "invalid", actor, repository)).rejects.toThrow();
    await expect(updateLeagueVisibility(id, "public", actor, repository)).rejects.toThrow();
    await expect(deleteLeague(id, "", actor, repository)).rejects.toThrow();
    expect(repository.setVisibility).not.toHaveBeenCalled();
  });
});
