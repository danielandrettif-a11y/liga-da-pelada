import { describe, expect, it } from "vitest";
import { calculatePlayerOveralls, type OverallAppearance, type OverallPlayer, type OverallRoundInput } from "./overall";

const players: OverallPlayer[] = [
  { id: "def", playerProfile: "defensive" },
  { id: "ata", playerProfile: "offensive" },
  { id: "gk", playerProfile: "midfield", isGoalkeeper: true },
];

function appearance(playerId: string, overrides: Partial<OverallAppearance> = {}): OverallAppearance {
  return {
    playerId,
    teamId: "team-a",
    secondsPlayed: 420,
    goalsConceded: 0,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    result: "win",
    playerProfileLocked: playerId === "def" ? "defensive" : playerId === "ata" ? "offensive" : "midfield",
    isGoalkeeper: playerId === "gk",
    ...overrides,
  };
}

function round(sequence: number, appearances: OverallAppearance[]): OverallRoundInput {
  return { id: `r${sequence}`, sequence, date: `2026-0${sequence}-01`, roundType: "official", status: "finished", appearances };
}

describe("motor adaptativo de OVR", () => {
  it("mantém a vantagem inicial temporária da tag e a limita a três pontos", () => {
    const result = calculatePlayerOveralls(players, []);
    const defender = result.snapshots.find((snapshot) => snapshot.playerId === "def")!;
    expect(defender.positions.DEF.value).toBe(73);
    expect(defender.positions.ATA.value).toBe(70);
  });

  it("dá mais crédito defensivo ao DEF do que ao ATA na mesma atuação coletiva", () => {
    const result = calculatePlayerOveralls(players, [round(1, [appearance("def"), appearance("ata")])]);
    const defender = result.snapshots.find((snapshot) => snapshot.playerId === "def")!;
    const attacker = result.snapshots.find((snapshot) => snapshot.playerId === "ata")!;
    expect(defender.positions.DEF.value).toBeGreaterThan(attacker.positions.DEF.value);
  });

  it("recompensa sete minutos sem sofrer mais do que uma partida curta sem sofrer", () => {
    const full = calculatePlayerOveralls([players[0]], [round(1, [appearance("def")])]);
    const short = calculatePlayerOveralls([players[0]], [round(1, [appearance("def", { secondsPlayed: 120 })])]);
    expect(full.snapshots[0].positions.DEF.value).toBeGreaterThan(short.snapshots[0].positions.DEF.value);
  });

  it("só calcula GOL para quem realmente atuou como goleiro", () => {
    const result = calculatePlayerOveralls(players, [round(1, [appearance("def"), appearance("gk")])]);
    const defender = result.snapshots.find((snapshot) => snapshot.playerId === "def")!;
    const goalkeeper = result.snapshots.find((snapshot) => snapshot.playerId === "gk")!;
    expect(defender.positions.GOL.validRounds).toBe(0);
    expect(goalkeeper.positions.GOL.validRounds).toBe(1);
  });

  it("não altera OVR com amistosos ou rodadas ainda abertas", () => {
    const inputs: OverallRoundInput[] = [
      { ...round(1, [appearance("def", { goals: 3 })]), roundType: "friendly" },
      { ...round(2, [appearance("def", { goals: 3 })]), status: "active" },
    ];
    const result = calculatePlayerOveralls([players[0]], inputs);
    expect(result.snapshots[0].positions.DEF.value).toBe(73);
    expect(result.snapshotsByRound).toHaveLength(0);
  });

  it("limita a mudança de cada posição a dois pontos por rodada", () => {
    const result = calculatePlayerOveralls([players[1]], [round(1, [appearance("ata", { goals: 5 })])]);
    expect(result.snapshots[0].positions.ATA.value).toBeLessThanOrEqual(75);
  });
});
