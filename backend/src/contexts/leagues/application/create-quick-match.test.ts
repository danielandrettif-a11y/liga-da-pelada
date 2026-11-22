import { describe, expect, it, vi } from "vitest";
import { createQuickMatch } from "./create-quick-match.js";

describe("createQuickMatch", () => {
  it("passes normalized input and verified actor to the transactional repository", async () => {
    const session = { league_id: "league-1", callup_id: "callup-1", round_id: "round-1" };
    const repository = { create: vi.fn().mockResolvedValue(session) };
    const actor = { userId: "verified-user" };
    await expect(createQuickMatch({
      date: "2026-10-24", start_time: "20:30", field_name: " Arena   BQ ", map_url: "maps.example/arena",
    }, actor, repository)).resolves.toEqual(session);
    expect(repository.create).toHaveBeenCalledWith({
      date: "2026-10-24", startTime: "20:30", fieldName: "Arena BQ",
      mapUrl: "https://maps.example/arena", playersPerTeam: 5, teamsPerRound: 3,
    }, actor);
  });
});
