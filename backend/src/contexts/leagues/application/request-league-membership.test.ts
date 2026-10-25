import { describe, expect, it, vi } from "vitest";
import { requestLeagueMembership } from "./request-league-membership.js";

const leagueId = "00000000-0000-4000-8000-000000000001";

describe("requestLeagueMembership", () => {
  it("validates the league id and uses the verified actor", async () => {
    const repository = { request: vi.fn().mockResolvedValue(true) };
    await expect(requestLeagueMembership(leagueId.toUpperCase(), { userId: "verified-user" }, repository))
      .resolves.toEqual({ requested: true });
    expect(repository.request).toHaveBeenCalledWith(leagueId, { userId: "verified-user" });
  });

  it("rejects malformed ids before persistence", async () => {
    const repository = { request: vi.fn() };
    await expect(requestLeagueMembership("not-a-uuid", { userId: "verified-user" }, repository)).rejects.toThrow("Pelada inválida");
    expect(repository.request).not.toHaveBeenCalled();
  });
});
