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
  const characteristicsFormula = parseOverallFormulaConfig({
    legacySeedEnabled: false,
    unselectedTraitEvidence: 0.15,
    weeklyEvidenceCap: true,
    traitWeightedChange: false,
    traitBasedOverall: true,
    overallConfidenceShrink: false,
    rankedTraitOverall: true,
    performanceChangeBonus: 0.05,
    hardPositionCapsEnabled: false,
    provisionalAtConfidenceThreshold: false,
  });
  const trendFormula = parseOverallFormulaConfig({
    legacySeedEnabled: false,
    unselectedTraitEvidence: 0.15,
    weeklyEvidenceCap: true,
    traitWeightedChange: false,
    traitBasedOverall: true,
    overallConfidenceShrink: false,
    rankedTraitOverall: true,
    performanceChangeBonus: 0.05,
    hardPositionCapsEnabled: false,
    provisionalAtConfidenceThreshold: false,
    trendEnabled: true,
    trendWindowRounds: 3,
    trendMinimumRounds: 3,
    trendRequiredRounds: 2,
    trendHighScore: 0.56,
    trendLowScore: 0.42,
    trendUpwardMultiplier: 0.2,
    trendDownwardMultiplier: 0.3,
  });
  const roleReframeFormula = parseOverallFormulaConfig({
    ...characteristicsFormula,
    traitWeightedChange: true,
    separateAttackScores: true,
    goalCurve: 0.32,
    assistCurve: 0.28,
    positionWeights: {
      DEF: { defense: 0.70, goals: 0.05, assists: 0.20, result: 0.05 },
      ALA_MEI: { defense: 0.40, goals: 0.25, assists: 0.30, result: 0.05 },
      ATA: { defense: 0.10, goals: 0.60, assists: 0.25, result: 0.05 },
    },
  });
  const balancedCharacteristicsFormula = parseOverallFormulaConfig({
    ...roleReframeFormula,
    // A participação da característica já reduz a confiança/target da posição
    // e define a composição do OVR. Aplicá-la novamente no limite semanal
    // cria uma vantagem artificial para especialistas de uma única função.
    traitWeightedChange: false,
    maxChangePerRound: 1.5,
    performanceChangeBonus: 0.03,
  });

  it("separa gols e assistências no OVR V10 sem transformar vitória em defesa", () => {
    const scorer = { id: "scorer", playerProfile: "offensive" as const, overallTraits: ["offensive" as const], overallSeedMode: "observed" as const };
    const creator = { id: "creator", playerProfile: "midfield" as const, overallTraits: ["midfield" as const], overallSeedMode: "observed" as const };
    const rounds = Array.from({ length: 3 }, (_, index) => round(index + 1, [
      appearance("scorer", { goals: 2, assists: 0, playerProfileLocked: "offensive" }),
      appearance("creator", { goals: 0, assists: 3, playerProfileLocked: "midfield" }),
    ]));
    const result = calculatePlayerOveralls([scorer, creator], rounds, roleReframeFormula);
    const scorerResult = result.snapshots.find((item) => item.playerId === "scorer")!;
    const creatorResult = result.snapshots.find((item) => item.playerId === "creator")!;
    expect(scorerResult.positions.ATA.value).toBeGreaterThan(scorerResult.positions.DEF.value);
    expect(creatorResult.positions.ALA_MEI.value).toBeGreaterThan(creatorResult.positions.ATA.value);
  });

  it("não deixa uma única característica superar histórico melhor por dupla aceleração", () => {
    const specialist: OverallPlayer = {
      id: "specialist",
      playerProfile: "offensive",
      overallTraits: ["offensive"],
      overallSeedMode: "observed",
    };
    const versatile: OverallPlayer = {
      id: "versatile",
      playerProfile: "offensive",
      overallTraits: ["midfield", "offensive"],
      overallSeedMode: "observed",
    };
    const inputs = [
      round(1, [
        appearance("specialist", { goals: 4, playerProfileLocked: "offensive" }),
        appearance("versatile", { goals: 4, assists: 3, playerProfileLocked: "offensive" }),
      ]),
      round(2, [
        appearance("specialist", { goals: 4, assists: 1, playerProfileLocked: "offensive" }),
        appearance("versatile", { goals: 4, assists: 3, playerProfileLocked: "offensive" }),
      ]),
      round(3, [
        appearance("versatile", { goals: 4, assists: 3, playerProfileLocked: "offensive" }),
      ]),
    ];

    const previous = calculatePlayerOveralls([specialist, versatile], inputs, roleReframeFormula);
    const balanced = calculatePlayerOveralls([specialist, versatile], inputs, balancedCharacteristicsFormula);
    const previousSpecialist = previous.snapshots.find((item) => item.playerId === "specialist")!;
    const previousVersatile = previous.snapshots.find((item) => item.playerId === "versatile")!;
    const balancedSpecialist = balanced.snapshots.find((item) => item.playerId === "specialist")!;
    const balancedVersatile = balanced.snapshots.find((item) => item.playerId === "versatile")!;

    expect(previousSpecialist.overall).toBeGreaterThan(previousVersatile.overall);
    expect(balancedVersatile.overall).toBeGreaterThan(balancedSpecialist.overall);
    expect(balancedSpecialist.overall).toBeLessThan(previousSpecialist.overall);
    expect(balancedVersatile.positions.ATA.value).toBeGreaterThan(previousVersatile.positions.ATA.value);
  });

  it("segura uma amostra de uma rodada sem esconder um bom desempenho", () => {
    const newcomer: OverallPlayer = {
      id: "newcomer",
      playerProfile: "offensive",
      overallTraits: ["offensive"],
      overallSeedMode: "observed",
    };
    const snapshot = calculatePlayerOveralls([newcomer], [round(1, [
      appearance("newcomer", { goals: 5, assists: 3, playerProfileLocked: "offensive" }),
    ])], balancedCharacteristicsFormula).snapshots[0];

    expect(snapshot.positions.ATA.value).toBeGreaterThan(70);
    expect(snapshot.positions.ATA.value).toBeLessThanOrEqual(71.7);
    expect(snapshot.isProvisional).toBe(true);
  });

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

  it("não deixa rodízio no gol sobrescrever o OVR geral de atleta de linha", () => {
    const linePlayer: OverallPlayer = {
      id: "line-player",
      playerProfile: "offensive",
      overallTraits: ["offensive"],
      overallSeedMode: "observed",
      isGoalkeeper: false,
    };
    const rounds = Array.from({ length: 3 }, (_, index) => round(index + 1, [
      appearance("line-player", {
        isGoalkeeper: true,
        playerProfileLocked: "offensive",
        goalsConceded: 0,
      }),
    ]));

    const snapshot = calculatePlayerOveralls([linePlayer], rounds, characteristicsFormula).snapshots[0];

    expect(snapshot.positions.GOL.value).toBeGreaterThan(snapshot.positions.ATA.value);
    expect(snapshot.overall).toBe(snapshot.positions.ATA.value);
    expect(snapshot.trend).toBe(snapshot.positionTrends.ATA);
  });

  it("não deixa muitas partidas da mesma rodada levarem todas as posições a 100% de confiança", () => {
    const midfielder = { ...observedPlayers[0], overallTraits: ["midfield" as const] };
    const manyMatches = Array.from({ length: 12 }, (_, index) => appearance("def", {
      matchId: `m-${index}`,
      goals: index === 0 ? 2 : 0,
    }));
    const result = calculatePlayerOveralls([midfielder], [
      round(1, manyMatches),
      round(2, manyMatches),
      round(3, manyMatches),
    ], characteristicsFormula).snapshots[0];
    expect(result.positions.ALA_MEI.confidence).toBeGreaterThan(0.8);
    expect(result.positions.DEF.confidence).toBeLessThan(0.5);
    expect(result.positions.ATA.confidence).toBeLessThan(0.5);
  });

  it("faz a característica selecionada evoluir claramente mais que uma não selecionada", () => {
    const midfielder = { ...observedPlayers[0], overallTraits: ["midfield" as const] };
    const defensiveAttacker = { ...observedPlayers[1], overallTraits: ["defensive" as const, "offensive" as const] };
    const inputs = Array.from({ length: 3 }, (_, index) => round(index + 1, [
      appearance("def", { goals: 2, assists: 2, goalsConceded: 0 }),
      appearance("ata", { goals: 2, assists: 2, goalsConceded: 0 }),
    ]));
    const result = calculatePlayerOveralls([midfielder, defensiveAttacker], inputs, characteristicsFormula);
    const mei = result.snapshots.find((snapshot) => snapshot.playerId === "def")!;
    const defAta = result.snapshots.find((snapshot) => snapshot.playerId === "ata")!;
    expect(mei.positions.ALA_MEI.value).toBeGreaterThan(defAta.positions.ALA_MEI.value);
    expect(defAta.positions.DEF.value).toBeGreaterThan(mei.positions.DEF.value);
    expect(defAta.positions.ATA.value).toBeGreaterThan(mei.positions.ATA.value);
  });

  it("compõe o OVR geral favorecendo a melhor característica sem ignorar a segunda", () => {
    const midfielder = { ...observedPlayers[0], overallTraits: ["midfield" as const] };
    const versatile = { ...observedPlayers[1], overallTraits: ["defensive" as const, "offensive" as const] };
    const inputs = Array.from({ length: 3 }, (_, index) => round(index + 1, [
      appearance("def", { goals: 3, assists: 2, goalsConceded: 1 }),
      appearance("ata", { goals: 3, assists: 2, goalsConceded: 1 }),
    ]));
    const result = calculatePlayerOveralls([midfielder, versatile], inputs, characteristicsFormula);
    const mei = result.snapshots.find((snapshot) => snapshot.playerId === "def")!;
    const defAta = result.snapshots.find((snapshot) => snapshot.playerId === "ata")!;
    expect(mei.overall).toBe(mei.positions.ALA_MEI.value);
    const ordered = [defAta.positions.DEF.value, defAta.positions.ATA.value].sort((left, right) => right - left);
    expect(defAta.overall).toBeCloseTo(ordered[0] * 0.7 + ordered[1] * 0.3, 1);
  });

  it("preserva diferença entre atacantes fortes sem empate no teto rígido", () => {
    const good = { id: "good", playerProfile: "offensive" as const, overallTraits: ["offensive" as const], overallSeedMode: "observed" as const };
    const exceptional = { id: "exceptional", playerProfile: "offensive" as const, overallTraits: ["offensive" as const], overallSeedMode: "observed" as const };
    const inputs = Array.from({ length: 3 }, (_, index) => round(index + 1, [
      appearance("good", { goals: 2, assists: 1, playerProfileLocked: "offensive" }),
      appearance("exceptional", { goals: 4, assists: 3, playerProfileLocked: "offensive" }),
    ]));
    const result = calculatePlayerOveralls([good, exceptional], inputs, characteristicsFormula);
    const goodSnapshot = result.snapshots.find((snapshot) => snapshot.playerId === "good")!;
    const exceptionalSnapshot = result.snapshots.find((snapshot) => snapshot.playerId === "exceptional")!;
    expect(exceptionalSnapshot.positions.ATA.value).toBeGreaterThan(goodSnapshot.positions.ATA.value);
  });

  it("deixa de marcar como provisório ao completar três rodadas", () => {
    const inputs = Array.from({ length: 3 }, (_, index) => round(index + 1, [appearance("ata", { goals: 1 })]));
    const result = calculatePlayerOveralls([observedPlayers[1]], inputs, characteristicsFormula);
    expect(result.snapshots[0].isProvisional).toBe(false);
  });

  it("acelera a subida da posição quando duas das últimas três rodadas são boas", () => {
    const inputs = Array.from({ length: 3 }, (_, index) => round(index + 1, [
      appearance("ata", { goals: 2, assists: 1, result: "win" }),
    ]));
    const withTrend = calculatePlayerOveralls([observedPlayers[1]], inputs, trendFormula).snapshots[0];
    const withoutTrend = calculatePlayerOveralls([observedPlayers[1]], inputs, characteristicsFormula).snapshots[0];

    expect(withTrend.positionTrends.ATA).toBe("rising");
    expect(withTrend.trend).toBe("rising");
    expect(withTrend.positions.ATA.value).toBeGreaterThan(withoutTrend.positions.ATA.value);
  });

  it("acelera a queda somente depois de uma sequência ruim na posição", () => {
    const inputs = [
      ...Array.from({ length: 3 }, (_, index) => round(index + 1, [appearance("ata", { goals: 3, assists: 1, result: "win" })])),
      ...Array.from({ length: 3 }, (_, index) => round(index + 4, [appearance("ata", { goalsConceded: 2, concededGoalSeconds: [30, 90], result: "loss" })])),
    ];
    const withTrend = calculatePlayerOveralls([observedPlayers[1]], inputs, trendFormula).snapshots[0];
    const withoutTrend = calculatePlayerOveralls([observedPlayers[1]], inputs, characteristicsFormula).snapshots[0];

    expect(withTrend.positionTrends.ATA).toBe("falling");
    expect(withTrend.trend).toBe("falling");
    expect(withTrend.positions.ATA.value).toBeLessThan(withoutTrend.positions.ATA.value);
  });

  it("mantém a tendência estável antes de três rodadas jogadas", () => {
    const result = calculatePlayerOveralls([observedPlayers[1]], [
      round(1, [appearance("ata", { goals: 3, result: "win" })]),
      round(2, [appearance("ata", { goals: 3, result: "win" })]),
    ], trendFormula).snapshots[0];

    expect(result.positionTrends.ATA).toBe("steady");
    expect(result.trend).toBe("steady");
  });

  it("não conta uma ausência como rodada ruim para a tendência", () => {
    const result = calculatePlayerOveralls([observedPlayers[1]], [
      round(1, [appearance("ata", { goals: 2, result: "win" })]),
      round(2, [appearance("ata", { goals: 2, result: "win" })]),
      round(3, [appearance("ata", { goals: 2, result: "win" })]),
      round(4, []),
      round(5, []),
      round(6, [appearance("ata", { goals: 2, result: "win" })]),
    ], trendFormula).snapshots[0];

    expect(result.positionTrends.ATA).toBe("rising");
  });
});
