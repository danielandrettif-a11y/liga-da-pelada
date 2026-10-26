import { describe, expect, it, vi } from "vitest";
import { deleteStadium, getStadiums, reorderStadiums, saveStadium } from "./manage-stadiums.js";

const leagueId = "00000000-0000-4000-8000-000000000001";
const stadiumId = "00000000-0000-4000-8000-000000000002";
const actor = { userId: "verified-user" };

describe("stadium use cases", () => {
  it("passes normalized commands and verified actor to the repository", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: stadiumId }),
      update: vi.fn().mockResolvedValue({ id: stadiumId }), delete: vi.fn(), reorder: vi.fn(),
    };
    await getStadiums(leagueId, actor, repository);
    await saveStadium(leagueId, null, {
      name: " Arena ", address: "", google_maps_url: "maps.example/arena", latitude: null, longitude: null,
    }, actor, repository);
    await deleteStadium(leagueId, stadiumId, actor, repository);
    await reorderStadiums(leagueId, [stadiumId], actor, repository);
    expect(repository.create).toHaveBeenCalledWith(leagueId, {
      name: "Arena", address: null, googleMapsUrl: "https://maps.example/arena", latitude: null, longitude: null,
    }, actor);
    expect(repository.delete).toHaveBeenCalledWith(leagueId, stadiumId, actor);
    expect(repository.reorder).toHaveBeenCalledWith(leagueId, [stadiumId], actor);
  });
});
