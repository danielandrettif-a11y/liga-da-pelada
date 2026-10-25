import { describe, expect, it, vi } from "vitest";
import { joinOpenLeague, requestLeagueMembershipByInvite, toggleLeagueFavorite } from "./manage-league-membership.js";

const id = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("league lobby membership use cases", () => {
  it("joins an open league and toggles a favorite using the verified actor", async () => {
    const repository = {
      joinOpen: vi.fn().mockResolvedValue(true),
      toggleFavorite: vi.fn().mockResolvedValue(false),
      requestByInvite: vi.fn(),
    };
    await expect(joinOpenLeague(id, actor, repository)).resolves.toEqual({ joined: true });
    await expect(toggleLeagueFavorite(id, actor, repository)).resolves.toEqual({ favorite: false });
    expect(repository.joinOpen).toHaveBeenCalledWith(id, actor);
    expect(repository.toggleFavorite).toHaveBeenCalledWith(id, actor);
  });

  it("requests access by a validated invitation token", async () => {
    const repository = {
      joinOpen: vi.fn(),
      toggleFavorite: vi.fn(),
      requestByInvite: vi.fn().mockResolvedValue(id),
    };
    await expect(requestLeagueMembershipByInvite(id, actor, repository)).resolves.toEqual({ league_id: id });
    await expect(requestLeagueMembershipByInvite("invalid", actor, repository)).rejects.toThrow("Pelada inválida");
    expect(repository.requestByInvite).toHaveBeenCalledTimes(1);
  });
});
