import { describe, expect, it } from "vitest";
import { buildStructuralLoans, orderLoanQueue, rebalanceTeamRosters, validateUnderfilledTeamSizes } from "./underfilled-rounds";

describe("rodadas incompletas", () => {
  it("aceita divisões equilibradas e rejeita times desproporcionais", () => {
    expect(validateUnderfilledTeamSizes([5, 5, 5], 15, 6)).toBeNull();
    expect(validateUnderfilledTeamSizes([6, 5, 5], 16, 6)).toBeNull();
    expect(validateUnderfilledTeamSizes([7, 3, 2], 12, 6)).toContain("máximo 6");
  });

  it("limita o modo 5x5 a quinze jogadores", () => {
    expect(validateUnderfilledTeamSizes([5, 5, 5], 16, 5)).toContain("no máximo 15");
  });

  it("reequilibra o sorteio por chegada sem perder jogadores", () => {
    expect(rebalanceTeamRosters([[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13, 14, 15]]))
      .toEqual([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]]);
    expect(rebalanceTeamRosters([[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], []]).map((team) => team.length))
      .toEqual([4, 4, 4]);
  });

  it("percorre a fila antes de repetir", () => {
    const candidates = [
      { playerId: "p1", loanOrder: 1 },
      { playerId: "p2", loanOrder: 2 },
      { playerId: "p3", loanOrder: 3 },
    ];
    expect(orderLoanQueue(candidates, new Map([["p1", 1]]))[0].playerId).toBe("p2");
    expect(orderLoanQueue(candidates, new Map([["p1", 1], ["p2", 1], ["p3", 1]]))[0].playerId).toBe("p1");
  });

  it("completa 5x5 com dois nomes diferentes do time de fora", () => {
    const loans = buildStructuralLoans({
      teams: [
        { id: "a", position: 1, players: Array.from({ length: 5 }, (_, i) => ({ playerId: `a${i}`, loanOrder: i + 1, eligible: true })) },
        { id: "b", position: 2, players: Array.from({ length: 5 }, (_, i) => ({ playerId: `b${i}`, loanOrder: i + 1, eligible: true })) },
        { id: "c", position: 3, players: Array.from({ length: 5 }, (_, i) => ({ playerId: `c${i}`, loanOrder: i + 1, eligible: true })) },
      ],
      selectedTeamIds: ["a", "b"],
      targetPlayersPerTeam: 6,
      previousLoanCount: new Map(),
    });
    expect(loans.map((loan) => loan.playerId)).toEqual(["c0", "c1"]);
    expect(loans.map((loan) => loan.rotationOrder)).toEqual([6, 6]);
  });

  it("aceita trocar o empréstimo sem retirar o recusado das rodadas futuras", () => {
    const teams = [
      { id: "a", position: 1, players: Array.from({ length: 5 }, (_, i) => ({ playerId: `a${i}`, loanOrder: i + 1, eligible: true })) },
      { id: "b", position: 2, players: Array.from({ length: 5 }, (_, i) => ({ playerId: `b${i}`, loanOrder: i + 1, eligible: true })) },
      { id: "c", position: 3, players: Array.from({ length: 5 }, (_, i) => ({ playerId: `c${i}`, loanOrder: i + 1, eligible: true })) },
    ];
    const changed = buildStructuralLoans({
      teams,
      selectedTeamIds: ["a", "b"],
      targetPlayersPerTeam: 6,
      previousLoanCount: new Map(),
      reservedPlayerIds: new Set(["c0"]),
      preferredPlayerBySlot: new Map([["a:6", "c2"]]),
    });
    expect(changed.map((loan) => loan.playerId)).toEqual(["c2", "c1"]);
    const nextMatch = buildStructuralLoans({ teams, selectedTeamIds: ["a", "b"], targetPlayersPerTeam: 6, previousLoanCount: new Map() });
    expect(nextMatch[0].playerId).toBe("c0");
  });
});
