import { describe, expect, it, vi } from "vitest";
import { authorizeLeagueSelection, completeLeagueEntryFlow } from "./manage-league-entry.js";

const actor = { userId: "verified-user" };
const leagueId = "00000000-0000-4000-8000-000000000001";

describe("league entry use cases", () => {
  it("completes presentation and authorizes explicit selections", async () => {
    const repository = {
      completeEntryFlow: vi.fn().mockResolvedValue(undefined),
      authorizeSelection: vi.fn().mockResolvedValue(undefined),
    };
    await expect(completeLeagueEntryFlow(1, actor, repository)).resolves.toEqual({ completed: true });
    await expect(authorizeLeagueSelection(leagueId, "archived-quick", actor, repository))
      .resolves.toEqual({ authorized: true });
    expect(repository.completeEntryFlow).toHaveBeenCalledWith(1, actor);
    expect(repository.authorizeSelection).toHaveBeenCalledWith(leagueId, "archived-quick", actor);
  });
});
