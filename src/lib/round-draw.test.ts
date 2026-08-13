import { describe, expect, it } from "vitest";
import { drawTeamsByAttendance } from "./round-draw";

const players = Array.from({ length: 20 }, (_, index) => ({
  id: `p${index + 1}`,
  points: 20 - index,
  player_profile: index % 2 ? "midfield" as const : "offensive" as const,
  is_goalkeeper: index === 0 || index === 5,
}));

describe("sorteio por ordem de chegada", () => {
  it("coloca os dez primeiros presentes nos dois times titulares", () => {
    const result = drawTeamsByAttendance({
      players: players.slice(0, 15),
      attendanceOrder: players.slice(0, 10).map((player) => player.id),
      teamCount: 3,
      playersPerTeam: 5,
      mode: "random",
      random: () => 0.25,
    });
    expect(new Set(result.teams.slice(0, 2).flat())).toEqual(new Set(players.slice(0, 10).map((player) => player.id)));
    expect(result.teams[2]).toEqual(players.slice(10, 15).map((player) => player.id));
  });

  it("preenche os times de espera em sequencia", () => {
    const result = drawTeamsByAttendance({
      players,
      attendanceOrder: players.slice(0, 12).map((player) => player.id),
      teamCount: 4,
      playersPerTeam: 5,
      mode: "balanced",
    });
    expect(result.teams[2]).toEqual(["p11", "p12", "p13", "p14", "p15"]);
    expect(result.teams[3]).toEqual(["p16", "p17", "p18", "p19", "p20"]);
  });

  it("exige dois times completos presentes", () => {
    expect(() => drawTeamsByAttendance({
      players: players.slice(0, 15),
      attendanceOrder: players.slice(0, 9).map((player) => player.id),
      teamCount: 3,
      playersPerTeam: 5,
      mode: "random",
    })).toThrow("Marque pelo menos 10 presencas.");
  });
});
