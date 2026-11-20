import { describe, expect, it, vi } from "vitest";
import { readLeagueFantasyParticipants } from "./supabase-ranking-reader";

describe("readLeagueFantasyParticipants", () => {
  it("limits the collective overview to active members of the requested league", async () => {
    const query: any = { select: vi.fn(), eq: vi.fn(), not: vi.fn() };
    for (const method of ["select", "eq", "not"]) query[method].mockReturnValue(query);
    const client = { from: vi.fn().mockReturnValue(query) };
    await readLeagueFantasyParticipants(client as any, "league-a");
    expect(client.from).toHaveBeenCalledWith("league_members");
    expect(query.eq).toHaveBeenCalledWith("league_id", "league-a");
    expect(query.eq).toHaveBeenCalledWith("is_active", true);
    expect(query.not).toHaveBeenCalledWith("user_id", "is", null);
  });
});
