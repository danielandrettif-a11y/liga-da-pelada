import { describe, expect, it, vi } from "vitest";
import { joinOpenLeague, requestLeagueMembershipByInvite, setLeagueFavorite } from "./manage-league-membership.js";

const id = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

describe("league lobby membership use cases", () => {
  it("joins an open league and sets a favorite using the verified actor", async () => {
    const repository = {
      joinOpen: vi.fn().mockResolvedValue(true),
      setFavorite: vi.fn().mockResolvedValue(false),
      requestByInvite: vi.fn(),
    };
    await expect(joinOpenLeague(id, actor, repository)).resolves.toEqual({ joined: true });
    await expect(setLeagueFavorite(id, false, actor, repository)).resolves.toEqual({ favorite: false });
    expect(repository.joinOpen).toHaveBeenCalledWith(id, actor);
    expect(repository.setFavorite).toHaveBeenCalledWith(id, false, actor);
  });

  it("requests access by a validated invitation token", async () => {
    const repository = {
      joinOpen: vi.fn(),
      setFavorite: vi.fn(),
      requestByInvite: vi.fn().mockResolvedValue(id),
    };
    await expect(requestLeagueMembershipByInvite(id, actor, repository)).resolves.toEqual({ league_id: id });
    await expect(requestLeagueMembershipByInvite("invalid", actor, repository)).rejects.toThrow("Pelada inválida");
    expect(repository.requestByInvite).toHaveBeenCalledTimes(1);
  });
});
