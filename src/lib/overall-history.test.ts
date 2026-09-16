import { describe, expect, it } from "vitest";
import { buildOverallHistoryInput } from "./overall-history";

const source = {
  players: [{ id: "def", playerProfile: "defensive" as const }, { id: "ata", playerProfile: "offensive" as const }],
  zeroPointOverrides: [],
  rounds: [{
    id: "r1",
    number: 1,
    date: "2026-09-01",
    round_type: "official" as const,
    status: "finished" as const,
    player_round_stats: [
      { player_id: "def", player_profile_locked: "defensive" as const },
      { player_id: "ata", player_profile_locked: "offensive" as const },
    ],
    matches: [{
      status: "finished",
      team_a_id: "a",
      team_b_id: "b",
      score_a: 2,
      score_b: 1,
      duration_seconds: 420,
      match_events: [
        { player_id: "ata", team_id: "a", elapsed_seconds: 60 },
        { player_id: "def", team_id: "b", elapsed_seconds: 100 },
        { player_id: "ata", team_id: "a", elapsed_seconds: 180 },
      ],
      match_players: [
        { player_id: "def", team_id: "a", entered_elapsed_seconds: 0 },
        { player_id: "ata", team_id: "a", entered_elapsed_seconds: 0 },
      ],
      match_goalkeepers: [],
    }],
  }],
};

describe("adaptação do histórico para OVR", () => {
  it("conta apenas gols sofridos durante a atuação e preserva a tag congelada", () => {
    const result = buildOverallHistoryInput(source);
    const defender = result.rounds[0].appearances.find((item) => item.playerId === "def")!;
    expect(defender.secondsPlayed).toBe(180);
    expect(defender.goalsConceded).toBe(1);
    expect(defender.playerProfileLocked).toBe("defensive");
  });

  it("remove completamente uma atuação zerada pelo administrador", () => {
    const result = buildOverallHistoryInput({ ...source, zeroPointOverrides: [{ round_id: "r1", player_id: "ata" }] });
    expect(result.rounds[0].appearances.map((item) => item.playerId)).toEqual(["def"]);
  });

  it("mantém a atuação legada quando o placar existe, mas faltam horários de gols", () => {
    const result = buildOverallHistoryInput({
      ...source,
      rounds: [{
        ...source.rounds[0],
        matches: [{ ...source.rounds[0].matches[0], match_events: [] }],
      }],
    });
    expect(result.rounds[0].appearances[0].secondsPlayed).toBe(420);
    expect(result.rounds[0].appearances[0].goalsConceded).toBe(1);
  });
});
