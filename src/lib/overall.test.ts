import { describe, expect, it } from "vitest";
import { calculatePlayerOveralls, parseOverallFormulaConfig, type OverallAppearance, type OverallPlayer, type OverallRoundInput } from "./overall";

const players: OverallPlayer[] = [
  { id: "def", playerProfile: "defensive", overallTraits: ["defensive"], overallSeedMode: "legacy_tag" },
  { id: "ata", playerProfile: "offensive", overallTraits: ["offensive"], overallSeedMode: "legacy_tag" },
  { id: "gk", playerProfile: "midfield", overallTraits: ["midfield"], overallSeedMode: "legacy_tag", isGoalkeeper: true },
];

const observedPlayers: OverallPlayer[] = players.map((player) => ({ ...player, overallSeedMode: "observed" }));

function appearance(playerId: string, overrides: Partial<OverallAppearance> = {}): OverallAppearance {
  return {
    playerId,
    matchId: "m1",
    teamId: "team-a",
    secondsPlayed: 420,
    matchSeconds: 420,
    goalsConceded: 0,
    teamGoalsConceded: 0,
    concededGoalSeconds: [],
    goalTimingQuality: "exact",
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
  const characteristicsFormula = parseOverallFormulaConfig({ legacySeedEnabled: false, unselectedTraitEvidence: 0.15 });

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

  it("usa a função exercida para separar confiança e evolução das posições", () => {
    const inputs = Array.from({ length: 4 }, (_, index) => round(index + 1, [
      appearance("def", { playerProfileLocked: "defensive", goalsConceded: 0 }),
      appearance("ata", { playerProfileLocked: "offensive", goalsConceded: 0 }),
    ]));
    const result = calculatePlayerOveralls(observedPlayers.slice(0, 2), inputs);
    const defender = result.snapshots.find((snapshot) => snapshot.playerId === "def")!;
    const attacker = result.snapshots.find((snapshot) => snapshot.playerId === "ata")!;
    expect(defender.positions.DEF.confidence).toBeGreaterThan(attacker.positions.DEF.confidence);
    expect(attacker.positions.ATA.confidence).toBeGreaterThan(defender.positions.ATA.confidence);
  });

  it("continua distinguindo ataques muito acima da média sem teto brusco", () => {
    const inputs = Array.from({ length: 10 }, (_, index) => round(index + 1, [
      appearance("def", { playerProfileLocked: "offensive", goals: 6 }),
      appearance("ata", { playerProfileLocked: "offensive", goals: 10 }),
    ]));
    const result = calculatePlayerOveralls(observedPlayers.slice(0, 2), inputs);
    const sixGoals = result.snapshots.find((snapshot) => snapshot.playerId === "def")!;
    const tenGoals = result.snapshots.find((snapshot) => snapshot.playerId === "ata")!;
    expect(tenGoals.positions.ATA.value).toBeGreaterThan(sixGoals.positions.ATA.value);
  });

  it("recompensa sete minutos sem sofrer mais do que uma partida curta sem sofrer", () => {
    const full = calculatePlayerOveralls([players[0]], [round(1, [appearance("def")])]);
    const short = calculatePlayerOveralls([players[0]], [round(1, [appearance("def", { secondsPlayed: 120 })])]);
    expect(full.snapshots[0].positions.DEF.confidence).toBeGreaterThan(short.snapshots[0].positions.DEF.confidence);
  });

  it("só calcula GOL para quem realmente atuou como goleiro", () => {
    const result = calculatePlayerOveralls(players, [round(1, [appearance("def"), appearance("gk")])]);
    const defender = result.snapshots.find((snapshot) => snapshot.playerId === "def")!;
    const goalkeeper = result.snapshots.find((snapshot) => snapshot.playerId === "gk")!;
    expect(defender.positions.GOL.validRounds).toBe(0);
    expect(goalkeeper.positions.GOL.validRounds).toBe(1);
  });

  it("valoriza mais a resistência até o fim do jogo do que sofrer cedo", () => {
    const early = calculatePlayerOveralls([observedPlayers[0]], [round(1, [appearance("def", {
      goalsConceded: 1,
      concededGoalSeconds: [30],
    })])]);
    const late = calculatePlayerOveralls([observedPlayers[0]], [round(1, [appearance("def", {
      goalsConceded: 1,
      concededGoalSeconds: [390],
    })])]);
    expect(late.snapshots[0].positions.DEF.value).toBeGreaterThan(early.snapshots[0].positions.DEF.value);
  });

  it("não deixa gols e assistências aumentarem a nota de goleiro", () => {
    const cleanGoalkeeper = calculatePlayerOveralls([players[2]], [round(1, [appearance("gk", { isGoalkeeper: true })])]);
    const attackingGoalkeeper = calculatePlayerOveralls([players[2]], [round(1, [appearance("gk", {
      isGoalkeeper: true,
      goals: 4,
      assists: 3,
    })])]);
    expect(attackingGoalkeeper.snapshots[0].positions.GOL.value).toBe(cleanGoalkeeper.snapshots[0].positions.GOL.value);
  });

  it("mantém a ordem real entre temporadas, mesmo quando o número da rodada reinicia", () => {
    const result = calculatePlayerOveralls([observedPlayers[1]], [
      { ...round(10, [appearance("ata", { goals: 3 })]), id: "old", date: "2026-08-01" },
      { ...round(1, [appearance("ata", { goals: 0 })]), id: "new", date: "2026-09-01" },
    ]);
    expect(result.snapshotsByRound.map((item) => item.roundId)).toEqual(["old", "new"]);
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

  it("usa características, e não a posição congelada da partida, como peso de evolução", () => {
    const traitDefender = { ...observedPlayers[0], overallTraits: ["defensive" as const] };
    const sameStatsDifferentOperationalRole = calculatePlayerOveralls([traitDefender], [
      round(1, [appearance("def", { playerProfileLocked: "offensive", goalsConceded: 0 })]),
      round(2, [appearance("def", { playerProfileLocked: "offensive", goalsConceded: 0 })]),
      round(3, [appearance("def", { playerProfileLocked: "offensive", goalsConceded: 0 })]),
    ], characteristicsFormula).snapshots[0];
    expect(sameStatsDifferentOperationalRole.positions.DEF.confidence).toBeGreaterThan(sameStatsDifferentOperationalRole.positions.ATA.confidence);
  });

  it("divide igualmente o peso entre duas características e deixa as demais em 15%", () => {
    const specialist = { ...observedPlayers[0], overallTraits: ["defensive" as const] };
    const versatile = { ...observedPlayers[0], overallTraits: ["defensive" as const, "midfield" as const] };
    const inputs = Array.from({ length: 3 }, (_, index) => round(index + 1, [appearance("def", { goalsConceded: 0 })]));
    const specialistSnapshot = calculatePlayerOveralls([specialist], inputs, characteristicsFormula).snapshots[0];
    const versatileSnapshot = calculatePlayerOveralls([versatile], inputs, characteristicsFormula).snapshots[0];
    expect(specialistSnapshot.positions.DEF.confidence).toBeGreaterThan(versatileSnapshot.positions.DEF.confidence);
    expect(versatileSnapshot.positions.ALA_MEI.confidence).toBeGreaterThan(specialistSnapshot.positions.ALA_MEI.confidence);
    expect(specialistSnapshot.positions.ATA.confidence).toBeLessThan(specialistSnapshot.positions.DEF.confidence);
  });

  it("mantém o OVR de goleiro independente das características selecionadas", () => {
    const defensiveGoalkeeper = { ...observedPlayers[2], overallTraits: ["defensive" as const] };
    const attackingGoalkeeper = { ...observedPlayers[2], overallTraits: ["offensive" as const] };
    const inputs = [round(1, [appearance("gk", { isGoalkeeper: true, goalsConceded: 0 })])];
    const defensive = calculatePlayerOveralls([defensiveGoalkeeper], inputs, characteristicsFormula).snapshots[0];
    const attacking = calculatePlayerOveralls([attackingGoalkeeper], inputs, characteristicsFormula).snapshots[0];
    expect(defensive.positions.GOL.value).toBe(attacking.positions.GOL.value);
  });
});
