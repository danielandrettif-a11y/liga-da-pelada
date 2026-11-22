import { describe, expect, it, vi } from "vitest";
import { getLeagueConfig, updateLeagueName, updateLeaguePreseason, updateLeagueSettings } from "./manage-league-config.js";

const id = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };

function repository() {
  return {
    getConfig: vi.fn().mockResolvedValue({ id }),
    updateName: vi.fn().mockResolvedValue("Pelada BQ"),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    setPreseason: vi.fn().mockResolvedValue(undefined),
  };
}

describe("league config use cases", () => {
  it("passes validated commands and the verified actor to the repository", async () => {
    const target = repository();
    await getLeagueConfig(id, actor, target as any);
    await expect(updateLeagueName(id, "  Pelada   BQ ", actor, target)).resolves.toEqual({ name: "Pelada BQ" });
    await expect(updateLeagueSettings(id, {
      match_duration: 8, players_per_team: 6, teams_per_round: 3,
      stadium_name: " Arena ", stadium_map_url: "https://maps.example/arena", event_duration_minutes: 150,
    }, actor, target)).resolves.toEqual({ updated: true });
    await expect(updateLeaguePreseason(id, true, actor, target)).resolves.toEqual({ enabled: true });
    expect(target.updateSettings).toHaveBeenCalledWith(id, {
      matchDuration: 8, playersPerTeam: 6, teamsPerRound: 3,
      stadiumName: "Arena", stadiumMapUrl: "https://maps.example/arena", eventDurationMinutes: 150,
    }, actor);
    expect(target.setPreseason).toHaveBeenCalledWith(id, true, actor);
  });

  it("rejects invalid input before persistence", async () => {
    const target = repository();
    await expect(updateLeagueName(id, "BQ", actor, target)).rejects.toThrow("3 e 80");
    await expect(updateLeagueSettings(id, {
      match_duration: 8, players_per_team: 11, teams_per_round: 3,
      stadium_name: "", stadium_map_url: "", event_duration_minutes: 120,
    }, actor, target)).rejects.toThrow("1 e 10");
    expect(target.updateName).not.toHaveBeenCalled();
    expect(target.updateSettings).not.toHaveBeenCalled();
  });
});
