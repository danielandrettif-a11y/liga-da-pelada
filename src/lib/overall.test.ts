import { describe, expect, it } from "vitest";
import { calculatePlayerOveralls, type OverallAppearance, type OverallPlayer, type OverallRoundInput } from "./overall";

const players: OverallPlayer[] = [
  { id: "def", playerProfile: "defensive", overallSeedMode: "legacy_tag" },
  { id: "ata", playerProfile: "offensive", overallSeedMode: "legacy_tag" },
  { id: "gk", playerProfile: "midfield", overallSeedMode: "legacy_tag", isGoalkeeper: true },
];

const observedPlayers: OverallPlayer[] = players.map((player) => ({ ...player, overallSeedMode: "observed" }));

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
  it("mantém todo jogador novo no OVR neutro, independente da tag operacional", () => {
    const result = calculatePlayerOveralls(observedPlayers, []);
    const defender = result.snapshots.find((snapshot) => snapshot.playerId === "def")!;
    expect(defender.overall).toBe(70);
    expect(defender.positions.DEF.value).toBe(70);
    expect(defender.positions.ATA.value).toBe(70);
  });

  it("dá aos jogadores oficiais legados 73 somente na posição indicada pela tag", () => {
    const result = calculatePlayerOveralls(players, []);
    const defender = result.snapshots.find((snapshot) => snapshot.playerId === "def")!;
    expect(defender.positions.DEF.value).toBe(73);
    expect(defender.positions.ALA_MEI.value).toBe(70);
    expect(defender.positions.ATA.value).toBe(70);
    expect(defender.overall).toBe(70);
  });

  it("dá mais crédito defensivo ao DEF do que ao ATA na mesma atuação coletiva", () => {
    const result = calculatePlayerOveralls(players, [
      round(1, [appearance("def"), appearance("ata")]),
      round(2, [appearance("def"), appearance("ata")]),
      round(3, [appearance("def"), appearance("ata")]),
    ]);
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
    const result = calculatePlayerOveralls([observedPlayers[0]], inputs);
    expect(result.snapshots[0].positions.DEF.value).toBe(70);
    expect(result.snapshotsByRound).toHaveLength(0);
  });

  it("limita a mudança de cada posição a dois pontos por rodada", () => {
    const result = calculatePlayerOveralls([observedPlayers[1]], [round(1, [appearance("ata", { goals: 5 })])]);
    expect(result.snapshots[0].positions.ATA.value).toBeLessThanOrEqual(72);
  });

  it("impede que uma posição provisória ultrapasse o teto da amostra", () => {
    const result = calculatePlayerOveralls([players[0]], [
      round(1, [appearance("def", { goalsConceded: 0, result: "win" })]),
      round(2, [appearance("def", { goalsConceded: 0, result: "win" })]),
    ]);
    const firstRound = result.snapshotsByRound[0].snapshots[0];
    const secondRound = result.snapshotsByRound[1].snapshots[0];
    expect(firstRound.positions.DEF.value).toBeLessThanOrEqual(74);
    expect(secondRound.positions.DEF.value).toBeLessThanOrEqual(76);
  });

  it("mantém o OVR geral perto de 70 quando existe somente uma rodada", () => {
    const result = calculatePlayerOveralls([observedPlayers[1]], [round(1, [
      appearance("ata", { goals: 2 }),
      appearance("ata", { goals: 2 }),
      appearance("ata", { goals: 2 }),
      appearance("ata", { goals: 2 }),
    ])]);
    expect(result.snapshots[0].overall).toBeLessThanOrEqual(71.5);
  });

  it("preserva a diferença entre o artilheiro da rodada e quem não produziu no ataque", () => {
    const quietMatches = Array.from({ length: 12 }, () => appearance("def", { goalsConceded: 1, result: "draw" }));
    const scorerMatches = Array.from({ length: 12 }, (_, index) => appearance("ata", {
      goalsConceded: 1,
      result: "draw",
      // Concentrar os scouts em uma partida reproduz o caso que antes era
      // achatado e depois diluído pelas demais partidas da rodada.
      goals: index === 0 ? 3 : 0,
      assists: index === 0 ? 2 : 0,
    }));
    const result = calculatePlayerOveralls(observedPlayers, [
      round(1, [...quietMatches, ...scorerMatches]),
      round(2, [...quietMatches, ...scorerMatches]),
      round(3, [...quietMatches, ...scorerMatches]),
    ]);
    const scorer = result.snapshots.find((snapshot) => snapshot.playerId === "ata")!;
    const quiet = result.snapshots.find((snapshot) => snapshot.playerId === "def")!;
    expect(scorer.positions.ATA.value).toBeGreaterThan(70);
    expect(scorer.positions.ATA.value).toBeGreaterThan(quiet.positions.ATA.value);
    expect(scorer.scoutTotals).toEqual({ goals: 9, assists: 6, ownGoals: 0 });
  });

  it("faz a estimativa legada desaparecer depois de três rodadas", () => {
    const badDefender = { ...players[0] };
    const observedDefender = { ...players[0], overallSeedMode: "observed" as const };
    const difficultRounds = Array.from({ length: 6 }, (_, index) => round(index + 1, [
      appearance("def", { goalsConceded: 2, result: "loss" }),
    ]));
    const legacy = calculatePlayerOveralls([badDefender], difficultRounds).snapshots[0];
    const observed = calculatePlayerOveralls([observedDefender], difficultRounds).snapshots[0];
    expect(Math.abs(legacy.positions.DEF.value - observed.positions.DEF.value)).toBeLessThanOrEqual(0.1);
  });

  it("marca como desatualizado após quatro rodadas semanais sem jogar", () => {
    const result = calculatePlayerOveralls([observedPlayers[0]], [
      round(1, [appearance("def")]),
      round(2, []),
      round(3, []),
      round(4, []),
      round(5, []),
    ]);
    expect(result.snapshots[0].isStale).toBe(true);
  });
});
