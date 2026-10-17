import { describe, expect, it } from "vitest";
import { parseOpenCallupRequest, resolveOpenCallupFormat } from "./open-callup";

const input = {
  date: "2026-10-17",
  startTime: null,
  stadiumId: null,
  roundType: null,
  playersPerTeam: null,
  teamsPerRound: null,
};

describe("entrada da convocação", () => {
  it("preserva padrões para hora, tipo e estádio", () => {
    expect(parseOpenCallupRequest(input)).toEqual({
      date: "2026-10-17", startTime: "08:00", stadiumId: null,
      roundType: "official", requestedPlayersPerTeam: null, requestedTeamsPerRound: null,
    });
  });

  it("mantém a normalização anterior da hora e do amistoso", () => {
    expect(parseOpenCallupRequest({ ...input, startTime: "19:30:00", roundType: "friendly", stadiumId: "stadium-1" }))
      .toMatchObject({ startTime: "19:30", roundType: "friendly", stadiumId: "stadium-1" });
  });

  it("recusa data fora do formato usado pelo formulário", () => {
    expect(parseOpenCallupRequest({ ...input, date: "17/10/2026" })).toBeNull();
  });
});

describe("capacidade de abertura", () => {
  const request = parseOpenCallupRequest(input)!;

  it("usa o padrão da pelada e calcula a capacidade", () => {
    expect(resolveOpenCallupFormat(request, { playersPerTeam: 7, teamsPerRound: 3 }))
      .toEqual({ format: { playersPerTeam: 7, teamsPerRound: 3, capacity: 21 } });
  });

  it("aceita a redução escolhida pelo ADM", () => {
    expect(resolveOpenCallupFormat({ ...request, requestedPlayersPerTeam: "6", requestedTeamsPerRound: "2" }, {
      playersPerTeam: 7, teamsPerRound: 3,
    })).toEqual({ format: { playersPerTeam: 6, teamsPerRound: 2, capacity: 12 } });
  });

  it.each([
    ["4", null, "Escolha 5, 6 ou 7 jogadores por time."],
    ["8", null, "Escolha 5, 6 ou 7 jogadores por time."],
    ["6.5", null, "Escolha 5, 6 ou 7 jogadores por time."],
    [null, "1", "Escolha de 2 a 6 times."],
    [null, "7", "Escolha de 2 a 6 times."],
  ])("recusa capacidade inválida (%s, %s)", (players, teams, error) => {
    expect(resolveOpenCallupFormat({ ...request, requestedPlayersPerTeam: players, requestedTeamsPerRound: teams }, {
      playersPerTeam: 5, teamsPerRound: 3,
    })).toEqual({ error });
  });
});
