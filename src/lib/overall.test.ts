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
  return { id: `r${sequence}`, sequence, date: `2026-01-${String(sequence).padStart(2, "0")}`, roundType: "official", status: "finished", appearances };
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
  const roleAdjustedRateFormula = parseOverallFormulaConfig({
    ...balancedCharacteristicsFormula,
    prioritizedTraitProgression: true,
    prioritizedTraitsAsEvidenceOnly: true,
    traitProgressionWeights: { primary: 1, secondary: 0.6, unselected: 0.2 },
    topThreeOverall: true,
    attackRatesByPlayingTime: true,
    playedRoleEvidenceEnabled: true,
    goalCurve: 3,
    assistCurve: 2.4,
    positionWeights: {
      DEF: { defense: 0.70, goals: 0.05, assists: 0.15, result: 0.10 },
      ALA_MEI: { defense: 0.30, goals: 0.25, assists: 0.35, result: 0.10 },
      ATA: { defense: 0.05, goals: 0.55, assists: 0.30, result: 0.10 },
    },
    roleEvidence: {
      DEF: { DEF: 1, ALA_MEI: 0.5, ATA: 0.2 },
      ALA_MEI: { DEF: 0.5, ALA_MEI: 1, ATA: 0.5 },
      ATA: { DEF: 0.2, ALA_MEI: 0.5, ATA: 1 },
    },
  });
  const goalkeeperOutcomeFormula = parseOverallFormulaConfig({
    ...roleAdjustedRateFormula,
    goalkeeperConfidenceRounds: 6,
    goalkeeperMaxChangePerRound: 0.8,
    goalkeeperOutcomeScoring: true,
    goalkeeperWeights: { conceded: 0.6, cleanSheet: 0.25, survival: 0.1, discipline: 0.05 },
  });
  const distributedTraitBonusFormula = parseOverallFormulaConfig({
    ...goalkeeperOutcomeFormula,
    traitsAsProgressionBonus: true,
    traitProgressionBonusBudget: 0.30,
    prioritizedTraitProgression: false,
  });
  const fluidProfileFormula = parseOverallFormulaConfig({
    ...distributedTraitBonusFormula,
    threePositionModel: true,
    fluidProfileEnabled: true,
    fluidProfileWarmupAppearances: 4,
    allConcededGoalTimingEnabled: true,
    defensiveOffensePenalty: 0,
    defensiveCollectiveCreditReduction: 0.6,
    oppositeRoleAcceleration: 1.5,
    playedRoleEvidenceEnabled: false,
    unselectedTraitEvidence: 1,
    unselectedTraitEvidenceEnabled: false,
    traitsAsProgressionBonus: false,
    prioritizedTraitProgression: false,
    prioritizedTraitsAsEvidenceOnly: false,
    traitInfluenceFadeEnabled: false,
    positionWeights: {
      DEF: { defense: 1, goals: 0, assists: 0, result: 0 },
      ALA_MEI: { defense: 0.05, goals: 0.62, assists: 0.33, result: 0 },
      ATA: { defense: 0.05, goals: 0.62, assists: 0.33, result: 0 },
    },
  });
  const adminFixedProfileFormula = parseOverallFormulaConfig({
    ...fluidProfileFormula,
    fluidProfileEnabled: false,
    adminFixedProfileEnabled: true,
    initialProfileAcceleration: 1,
    oppositeRoleAcceleration: 1,
    traitsAsProgressionBonus: true,
    traitProgressionBonusBudget: 0.30,
    unselectedTraitEvidence: 1,
    unselectedTraitEvidenceEnabled: false,
    traitInfluenceFadeEnabled: false,
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

  it("distribui no máximo 30% de aceleração entre as características da v12", () => {
    const formula = parseOverallFormulaConfig({
      ...balancedCharacteristicsFormula,
      traitBasedOverall: false,
      rankedTraitOverall: false,
      traitsAsProgressionBonus: true,
      traitProgressionBonusBudget: .30,
      topThreeOverall: true,
      unselectedTraitEvidence: 1,
    });
    const variants: OverallPlayer[] = [
      { id: "none", playerProfile: "offensive", overallTraits: [], overallSeedMode: "observed" },
      { id: "single", playerProfile: "offensive", overallTraits: ["offensive"], overallSeedMode: "observed" },
      { id: "primary", playerProfile: "offensive", overallTraits: ["offensive", "defensive"], overallSeedMode: "observed" },
      { id: "secondary", playerProfile: "offensive", overallTraits: ["defensive", "offensive"], overallSeedMode: "observed" },
      { id: "triple", playerProfile: "offensive", overallTraits: ["defensive", "midfield", "offensive"], overallSeedMode: "observed" },
    ];
    const inputs = Array.from({ length: 3 }, (_, index) => round(index + 1, variants.map((player) => appearance(player.id, { matchId: `bonus-${index}-${player.id}`, goals: 5, assists: 2, playerProfileLocked: "offensive" }))));
    const snapshots = new Map(calculatePlayerOveralls(variants, inputs, formula).snapshots.map((item) => [item.playerId, item]));
    expect(snapshots.get("single")!.positions.ATA.value).toBeGreaterThan(snapshots.get("primary")!.positions.ATA.value);
    expect(snapshots.get("primary")!.positions.ATA.value).toBeGreaterThan(snapshots.get("secondary")!.positions.ATA.value);
    expect(snapshots.get("secondary")!.positions.ATA.value).toBeGreaterThanOrEqual(snapshots.get("triple")!.positions.ATA.value);
    expect(snapshots.get("triple")!.positions.ATA.value).toBeGreaterThan(snapshots.get("none")!.positions.ATA.value);
    expect(snapshots.get("single")!.positions.DEF.value).toBe(snapshots.get("none")!.positions.DEF.value);
  });

  it("divide o bônus de progressão em 100%, 60/40 ou 50/30/20 na v16", () => {
    const formula = parseOverallFormulaConfig({
      ...distributedTraitBonusFormula,
      maxChangePerRound: 5,
      performanceChangeBonus: 0,
    });
    const variants: OverallPlayer[] = [
      { id: "none", playerProfile: "offensive", overallTraits: [], overallSeedMode: "observed" },
      { id: "single", playerProfile: "offensive", overallTraits: ["offensive"], overallSeedMode: "observed" },
      { id: "two-primary", playerProfile: "offensive", overallTraits: ["offensive", "defensive"], overallSeedMode: "observed" },
      { id: "two-secondary", playerProfile: "offensive", overallTraits: ["defensive", "offensive"], overallSeedMode: "observed" },
      { id: "three-primary", playerProfile: "offensive", overallTraits: ["offensive", "defensive", "midfield"], overallSeedMode: "observed" },
      { id: "three-secondary", playerProfile: "offensive", overallTraits: ["defensive", "offensive", "midfield"], overallSeedMode: "observed" },
      { id: "three-tertiary", playerProfile: "offensive", overallTraits: ["defensive", "midfield", "offensive"], overallSeedMode: "observed" },
    ];
    const result = calculatePlayerOveralls(variants, [round(1, variants.map((player) => appearance(player.id, {
      matchId: `v16-${player.id}`,
      playerProfileLocked: "offensive",
      goals: 5,
      assists: 2,
    })))], formula);
    const ata = new Map(result.snapshots.map((snapshot) => [snapshot.playerId, snapshot.positions.ATA.value]));

    expect(ata.get("none")).toBe(75);
    expect(ata.get("single")).toBe(76.5);
    expect(ata.get("two-primary")).toBe(75.9);
    expect(ata.get("two-secondary")).toBe(75.6);
    expect(ata.get("three-primary")).toBe(75.8);
    expect(ata.get("three-secondary")).toBe(75.5);
    expect(ata.get("three-tertiary")).toBe(75.3);
  });

  it("mantém a tag fixa do ADM mesmo quando o DEF supera o ATA", () => {
    const player: OverallPlayer = {
      id: "fixed-attacker",
      playerProfile: "offensive",
      initialPlayerProfile: "defensive",
      overallTraits: ["offensive"],
      overallSeedMode: "observed",
    };
    const result = calculatePlayerOveralls([player], Array.from({ length: 6 }, (_, index) => round(index + 1, [
      appearance(player.id, {
        matchId: `fixed-${index}`,
        playerProfileLocked: "defensive",
        goalsConceded: 0,
        teamGoalsConceded: 0,
      }),
    ])), adminFixedProfileFormula);

    expect(result.snapshots[0].positions.DEF.value).toBeGreaterThan(result.snapshots[0].positions.ATA.value);
    expect(result.snapshots[0].effectiveProfile).toBe("offensive");
    expect(result.breakdowns.every((item) => item.playedProfile === "offensive")).toBe(true);
  });

  it("divide o bônus permanente da v19 em 100% ou 60/40", () => {
    const variants: OverallPlayer[] = [
      { id: "fixed-none", playerProfile: "offensive", overallTraits: [], overallSeedMode: "observed" },
      { id: "fixed-single", playerProfile: "offensive", overallTraits: ["offensive"], overallSeedMode: "observed" },
      { id: "fixed-primary", playerProfile: "offensive", overallTraits: ["offensive", "defensive"], overallSeedMode: "observed" },
      { id: "fixed-secondary", playerProfile: "offensive", overallTraits: ["defensive", "offensive"], overallSeedMode: "observed" },
    ];
    const formula = parseOverallFormulaConfig({
      ...adminFixedProfileFormula,
      maxChangePerRound: 5,
      performanceChangeBonus: 0,
    });
    const result = calculatePlayerOveralls(variants, [round(1, variants.map((player) => appearance(player.id, {
      matchId: `fixed-boost-${player.id}`,
      goals: 5,
      assists: 2,
    })))], formula);
    const attack = new Map(result.snapshots.map((snapshot) => [snapshot.playerId, snapshot.positions.ATA.value]));

    expect(attack.get("fixed-single")).toBe(76.5);
    expect(attack.get("fixed-primary")).toBe(75.9);
    expect(attack.get("fixed-secondary")).toBe(75.6);
    expect(attack.get("fixed-none")).toBe(75);
  });

  it("mantém posição não marcada perto da base usando somente 20% da evidência", () => {
    const player: OverallPlayer = {
      id: "wing-forward",
      playerProfile: "midfield",
      overallTraits: ["midfield", "offensive"],
      overallSeedMode: "observed",
    };
    const inputs = Array.from({ length: 5 }, (_, index) => round(index + 1, [appearance(player.id, {
      matchId: `unselected-${index}`,
      playerProfileLocked: "midfield",
      goals: 2,
      assists: 2,
      goalsConceded: 0,
      result: "win",
    })]));
    const unrestricted = calculatePlayerOveralls([player], inputs, distributedTraitBonusFormula).snapshots[0];
    const limited = calculatePlayerOveralls([player], inputs, parseOverallFormulaConfig({
      ...distributedTraitBonusFormula,
      unselectedTraitEvidenceEnabled: true,
      unselectedTraitEvidence: 0.2,
    })).snapshots[0];

    expect(limited.positions.DEF.value).toBeGreaterThan(70);
    expect(limited.positions.DEF.value).toBeLessThan(unrestricted.positions.DEF.value);
    expect(limited.positions.DEF.confidence).toBeLessThan(unrestricted.positions.DEF.confidence);
    expect(limited.positions.ALA_MEI.value).toBe(unrestricted.positions.ALA_MEI.value);
    expect(limited.positions.ATA.value).toBe(unrestricted.positions.ATA.value);
  });

  it("retira gradualmente a influência das características após oito rodadas", () => {
    const player: OverallPlayer = {
      id: "organic-after-eight",
      playerProfile: "offensive",
      overallTraits: ["offensive"],
      overallSeedMode: "observed",
    };
    const formula = parseOverallFormulaConfig({
      ...distributedTraitBonusFormula,
      unselectedTraitEvidenceEnabled: true,
      unselectedTraitEvidence: 0.2,
      traitInfluenceFadeEnabled: true,
      traitFullInfluenceRounds: 8,
      traitFadeRounds: 8,
    });
    const result = calculatePlayerOveralls([player], Array.from({ length: 16 }, (_, index) => round(index + 1, [
      appearance(player.id, { matchId: `organic-${index}`, playerProfileLocked: "offensive" }),
    ])), formula);

    expect(result.breakdowns[7].traitEvidence.DEF).toBeCloseTo(0.2);
    expect(result.breakdowns[8].traitEvidence.DEF).toBeCloseTo(0.3);
    expect(result.breakdowns[15].traitEvidence.DEF).toBe(1);
  });

  it("usa a prioridade do ADM para limitar a evolução de cada posição na v13", () => {
    const formula = parseOverallFormulaConfig({
      ...balancedCharacteristicsFormula,
      traitsAsProgressionBonus: false,
      prioritizedTraitProgression: true,
      traitProgressionWeights: { primary: 1, secondary: 0.6, unselected: 0.2 },
      topThreeOverall: true,
    });
    const variants: OverallPlayer[] = [
      { id: "def-primary", playerProfile: "offensive", overallTraits: ["defensive"], overallSeedMode: "observed" },
      { id: "def-secondary", playerProfile: "offensive", overallTraits: ["offensive", "defensive"], overallSeedMode: "observed" },
      { id: "def-unselected", playerProfile: "defensive", overallTraits: ["offensive"], overallSeedMode: "observed" },
    ];
    const inputs = Array.from({ length: 3 }, (_, index) => round(index + 1, variants.map((player) => appearance(player.id, {
      matchId: `v13-${index}-${player.id}`,
      playerProfileLocked: player.id === "def-unselected" ? "defensive" : "offensive",
      goalsConceded: 0,
      teamGoalsConceded: 0,
      result: "win",
    }))));
    const snapshots = new Map(calculatePlayerOveralls(variants, inputs, formula).snapshots.map((item) => [item.playerId, item]));
    const primaryGain = snapshots.get("def-primary")!.positions.DEF.value - formula.base;
    const secondaryGain = snapshots.get("def-secondary")!.positions.DEF.value - formula.base;
    const unselectedGain = snapshots.get("def-unselected")!.positions.DEF.value - formula.base;

    expect(primaryGain).toBeGreaterThan(secondaryGain);
    expect(secondaryGain).toBeGreaterThan(unselectedGain);
    expect(unselectedGain).toBeLessThanOrEqual(primaryGain * 0.25);
  });

  it("usa a função realmente exercida para validar a posição na v14", () => {
    const player: OverallPlayer = { id: "style-only", playerProfile: "offensive", overallTraits: ["offensive"], overallSeedMode: "observed" };
    const inputs = (playedRole: "offensive" | "defensive") => Array.from({ length: 3 }, (_, index) => round(index + 1, [
      appearance(player.id, { playerProfileLocked: playedRole, goals: 2 }),
    ]));
    const offensiveRole = calculatePlayerOveralls([player], inputs("offensive"), roleAdjustedRateFormula).snapshots[0];
    const defensiveRole = calculatePlayerOveralls([player], inputs("defensive"), roleAdjustedRateFormula).snapshots[0];

    expect(offensiveRole.positions.ATA.value).toBeGreaterThan(defensiveRole.positions.ATA.value);
    expect(defensiveRole.positions.DEF.confidence).toBeGreaterThan(offensiveRole.positions.DEF.confidence);
  });

  it("normaliza gols e assistências pelo tempo jogado na v14", () => {
    const player: OverallPlayer = { id: "rate", playerProfile: "offensive", overallTraits: ["offensive"], overallSeedMode: "observed" };
    const oneMatch = calculatePlayerOveralls([player], [round(1, [
      appearance(player.id, { playerProfileLocked: "offensive", goals: 1, assists: 1 }),
    ])], roleAdjustedRateFormula).breakdowns[0];
    const twoMatches = calculatePlayerOveralls([player], [round(1, [
      appearance(player.id, { matchId: "m1", playerProfileLocked: "offensive", goals: 1, assists: 1 }),
      appearance(player.id, { matchId: "m2", playerProfileLocked: "offensive", goals: 1, assists: 1 }),
    ])], roleAdjustedRateFormula).breakdowns[0];

    expect(twoMatches.goalScore).toBeCloseTo(oneMatch.goalScore, 8);
    expect(twoMatches.assistScore).toBeCloseTo(oneMatch.assistScore, 8);
  });

  it("mantém o ATA acima do DEF para um ofensivo produtivo na função correta", () => {
    const player: OverallPlayer = { id: "productive-forward", playerProfile: "offensive", overallTraits: ["offensive"], overallSeedMode: "observed" };
    const inputs = Array.from({ length: 6 }, (_, index) => round(index + 1, [
      appearance(player.id, { playerProfileLocked: "offensive", goals: 1, assists: 1, goalsConceded: 0 }),
    ]));
    const snapshot = calculatePlayerOveralls([player], inputs, roleAdjustedRateFormula).snapshots[0];

    expect(snapshot.positions.ATA.value).toBeGreaterThan(snapshot.positions.DEF.value);
  });

  it("conta partidas distintas no gol para liberar a elegibilidade no oitavo jogo", () => {
    const keeper: OverallPlayer = { id: "keeper-v12", playerProfile: "midfield", overallTraits: [], overallSeedMode: "observed" };
    const formula = parseOverallFormulaConfig({ ...balancedCharacteristicsFormula, traitsAsProgressionBonus: true, topThreeOverall: true, goalkeeperEligibilityGames: 8 });
    const keeperAppearance = (matchId: string) => appearance(keeper.id, { matchId, isGoalkeeper: true, playerProfileLocked: "midfield" });
    const result = calculatePlayerOveralls([keeper], [
      round(1, Array.from({ length: 7 }, (_, index) => keeperAppearance(`gk-${index + 1}`))),
      round(2, [keeperAppearance("gk-8")]),
    ], formula);
    expect(result.snapshotsByRound[0].snapshots[0].goalkeeperGames).toBe(7);
    expect(result.snapshotsByRound[1].snapshots[0].goalkeeperGames).toBe(8);
  });

  it("não aumenta OVR GOL em rodadas jogadas somente na linha", () => {
    const keeper: OverallPlayer = { id: "keeper", playerProfile: "defensive", overallTraits: ["defensive"], overallSeedMode: "observed" };
    const result = calculatePlayerOveralls([keeper], [
      round(1, [appearance(keeper.id, { isGoalkeeper: true, goalsConceded: 0 })]),
      round(2, [appearance(keeper.id, { isGoalkeeper: false, goals: 2 })]),
      round(3, [appearance(keeper.id, { isGoalkeeper: false, goals: 2 })]),
    ], goalkeeperOutcomeFormula);

    const first = result.snapshotsByRound[0].snapshots[0].positions.GOL.value;
    expect(result.snapshots[0].positions.GOL.value).toBe(first);
  });

  it("preserva a tag DEF nas quatro primeiras atuações e usa ATA na quinta quando seu OVR é maior", () => {
    const player: OverallPlayer = {
      id: "fluid-def",
      playerProfile: "defensive",
      initialPlayerProfile: "defensive",
      overallTraits: ["defensive"],
      overallSeedMode: "observed",
    };
    const inputs = Array.from({ length: 5 }, (_, index) => round(index + 1, [appearance(player.id, {
      matchId: `fluid-def-${index}`,
      playerProfileLocked: "defensive",
      goals: 4,
      assists: 2,
      goalsConceded: 2,
      teamGoalsConceded: 2,
    })]));
    const result = calculatePlayerOveralls([player], inputs, fluidProfileFormula);
    const playerRounds = result.breakdowns.filter((item) => item.playerId === player.id);

    expect(playerRounds.slice(0, 4).map((item) => item.playedProfile)).toEqual([
      "defensive", "defensive", "defensive", "defensive",
    ]);
    expect(playerRounds[4].playedProfile).toBe("offensive");
    expect(playerRounds[4].profileSource).toBe("overall");
    expect(playerRounds[4].profileAtaOverall).toBeGreaterThan(playerRounds[4].profileDefOverall);
    expect(playerRounds[4].profileDefOverall).toBe(result.snapshotsByRound[3].snapshots[0].positions.DEF.value);
    expect(playerRounds[4].profileAtaOverall).toBe(result.snapshotsByRound[3].snapshots[0].positions.ATA.value);
  });

  it("preserva a tag ATA nas quatro primeiras atuações e usa DEF na quinta com consistência defensiva superior", () => {
    const player: OverallPlayer = {
      id: "fluid-ata",
      playerProfile: "offensive",
      initialPlayerProfile: "offensive",
      overallTraits: ["offensive"],
      overallSeedMode: "observed",
    };
    const inputs = Array.from({ length: 5 }, (_, index) => round(index + 1, [appearance(player.id, {
      matchId: `fluid-ata-${index}`,
      playerProfileLocked: "offensive",
      goals: 0,
      assists: 0,
      goalsConceded: 0,
      teamGoalsConceded: 0,
    })]));
    const result = calculatePlayerOveralls([player], inputs, fluidProfileFormula);
    const playerRounds = result.breakdowns.filter((item) => item.playerId === player.id);

    expect(playerRounds.slice(0, 4).every((item) => item.playedProfile === "offensive")).toBe(true);
    expect(playerRounds[4].playedProfile).toBe("defensive");
    expect(playerRounds[4].profileDefOverall).toBeGreaterThan(playerRounds[4].profileAtaOverall);
  });

  it("separa um defensor consistente de um artilheiro que protege pouco", () => {
    const defender: OverallPlayer = {
      id: "defensive-specialist",
      playerProfile: "defensive",
      initialPlayerProfile: "defensive",
      overallTraits: ["defensive"],
      overallSeedMode: "observed",
    };
    const scorer: OverallPlayer = {
      id: "attacking-specialist",
      playerProfile: "offensive",
      initialPlayerProfile: "offensive",
      overallTraits: ["offensive"],
      overallSeedMode: "observed",
    };
    const inputs = Array.from({ length: 6 }, (_, index) => round(index + 1, [
      appearance(defender.id, {
        matchId: `defensive-specialist-${index}`,
        goals: index === 5 ? 1 : 0,
        assists: index === 2 ? 1 : 0,
        goalsConceded: index === 3 || index === 5 ? 1 : 0,
        teamGoalsConceded: index === 3 || index === 5 ? 1 : 0,
      }),
      appearance(scorer.id, {
        matchId: `attacking-specialist-${index}`,
        goals: 2,
        assists: index % 2,
        goalsConceded: 2,
        teamGoalsConceded: 2,
        result: "loss",
      }),
    ]));
    const result = calculatePlayerOveralls([defender, scorer], inputs, fluidProfileFormula);
    const defenderSnapshot = result.snapshots.find((item) => item.playerId === defender.id)!;
    const scorerSnapshot = result.snapshots.find((item) => item.playerId === scorer.id)!;

    expect(defenderSnapshot.positions.DEF.value).toBeGreaterThan(scorerSnapshot.positions.DEF.value);
    expect(scorerSnapshot.positions.ATA.value).toBeGreaterThan(defenderSnapshot.positions.ATA.value);
    expect(scorerSnapshot.positions.DEF.value).toBeLessThan(fluidProfileFormula.base);
    expect(defenderSnapshot.effectiveProfile).toBe("defensive");
    expect(scorerSnapshot.effectiveProfile).toBe("offensive");
  });

  it("não deixa clean sheets coletivos inflarem o DEF de um artilheiro", () => {
    const quietDefender: OverallPlayer = {
      id: "quiet-clean-defender",
      playerProfile: "defensive",
      initialPlayerProfile: "defensive",
      overallTraits: ["defensive"],
      overallSeedMode: "observed",
    };
    const cleanScorer: OverallPlayer = {
      id: "clean-scorer",
      playerProfile: "defensive",
      initialPlayerProfile: "defensive",
      overallTraits: ["defensive"],
      overallSeedMode: "observed",
    };
    const inputs = Array.from({ length: 6 }, (_, index) => round(index + 1, [
      appearance(quietDefender.id, {
        matchId: `quiet-clean-${index}`,
        goalsConceded: 0,
        teamGoalsConceded: 0,
      }),
      appearance(cleanScorer.id, {
        matchId: `scorer-clean-${index}`,
        goals: 2,
        assists: 1,
        goalsConceded: 0,
        teamGoalsConceded: 0,
      }),
    ]));
    const result = calculatePlayerOveralls([quietDefender, cleanScorer], inputs, fluidProfileFormula);
    const defenderSnapshot = result.snapshots.find((item) => item.playerId === quietDefender.id)!;
    const scorerSnapshot = result.snapshots.find((item) => item.playerId === cleanScorer.id)!;

    expect(defenderSnapshot.positions.DEF.value - scorerSnapshot.positions.DEF.value).toBeGreaterThan(3);
    expect(scorerSnapshot.positions.ATA.value).toBeGreaterThan(defenderSnapshot.positions.ATA.value);
    expect(scorerSnapshot.effectiveProfile).toBe("offensive");
  });

  it("não conta ausências entre as quatro atuações iniciais", () => {
    const player: OverallPlayer = {
      id: "fluid-absence",
      playerProfile: "defensive",
      initialPlayerProfile: "defensive",
      overallTraits: ["defensive"],
      overallSeedMode: "observed",
    };
    const inputs = [
      round(1, [appearance(player.id, { goals: 4 })]),
      round(2, []),
      round(3, [appearance(player.id, { goals: 4 })]),
      round(4, []),
      round(5, [appearance(player.id, { goals: 4 })]),
      round(6, [appearance(player.id, { goals: 4 })]),
      round(7, [appearance(player.id, { goals: 4 })]),
    ];
    const appearances = calculatePlayerOveralls([player], inputs, fluidProfileFormula).breakdowns;

    expect(appearances.map((item) => item.appearanceNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(appearances.slice(0, 4).every((item) => item.playedProfile === "defensive")).toBe(true);
    expect(appearances[4].playedProfile).toBe("offensive");
  });

  it("mantém a tag anterior quando DEF e ATA empatam", () => {
    const player: OverallPlayer = {
      id: "fluid-tie",
      playerProfile: "offensive",
      initialPlayerProfile: "offensive",
      overallTraits: ["offensive"],
      overallSeedMode: "observed",
    };
    const equalFormula = parseOverallFormulaConfig({
      ...fluidProfileFormula,
      defensiveOffensePenalty: 0,
      defensiveCollectiveCreditReduction: 0,
      positionWeights: {
        DEF: { defense: 0.5, goals: 0.3, assists: 0.2, result: 0 },
        ALA_MEI: { defense: 0.5, goals: 0.3, assists: 0.2, result: 0 },
        ATA: { defense: 0.5, goals: 0.3, assists: 0.2, result: 0 },
      },
    });
    const inputs = Array.from({ length: 5 }, (_, index) => round(index + 1, [appearance(player.id, {
      matchId: `fluid-tie-${index}`,
      goals: 1,
      assists: 1,
      goalsConceded: 1,
    })]));
    const result = calculatePlayerOveralls([player], inputs, equalFormula);
    const fifth = result.breakdowns.filter((item) => item.playerId === player.id)[4];

    expect(fifth.profileDefOverall).toBe(fifth.profileAtaOverall);
    expect(fifth.playedProfile).toBe("offensive");
  });

  it("acelera em 1,5x somente a subida da posição oposta com desempenho superior", () => {
    const player: OverallPlayer = {
      id: "fluid-boost",
      playerProfile: "defensive",
      initialPlayerProfile: "defensive",
      overallTraits: ["defensive"],
      overallSeedMode: "observed",
    };
    const input = [round(1, [appearance(player.id, {
      goals: 5,
      assists: 3,
      goalsConceded: 2,
      teamGoalsConceded: 2,
    })])];
    const accelerated = calculatePlayerOveralls([player], input, fluidProfileFormula).snapshots[0];
    const regular = calculatePlayerOveralls([player], input, parseOverallFormulaConfig({
      ...fluidProfileFormula,
      oppositeRoleAcceleration: 1,
    })).snapshots[0];

    expect(accelerated.positions.ATA.value).toBeGreaterThan(regular.positions.ATA.value);
    expect(accelerated.positions.DEF.value).toBe(regular.positions.DEF.value);
  });

  it("facilita somente a subida da posição inicial durante as quatro primeiras atuações", () => {
    const player: OverallPlayer = {
      id: "fluid-initial-bias",
      playerProfile: "defensive",
      initialPlayerProfile: "defensive",
      overallTraits: ["defensive"],
      overallSeedMode: "observed",
    };
    const input = [round(1, [appearance(player.id, {
      goalsConceded: 0,
      teamGoalsConceded: 0,
      goals: 1,
    })])];
    const favored = calculatePlayerOveralls([player], input, parseOverallFormulaConfig({
      ...fluidProfileFormula,
      initialProfileAcceleration: 1.25,
      oppositeRoleAcceleration: 1,
    })).snapshots[0];
    const neutral = calculatePlayerOveralls([player], input, parseOverallFormulaConfig({
      ...fluidProfileFormula,
      initialProfileAcceleration: 1,
      oppositeRoleAcceleration: 1,
    })).snapshots[0];

    expect(favored.positions.DEF.value).toBeGreaterThan(neutral.positions.DEF.value);
    expect(favored.positions.ATA.value).toBe(neutral.positions.ATA.value);
  });

  it("usa atuações no gol somente no OVR GOL na v18", () => {
    const player: OverallPlayer = {
      id: "fluid-keeper",
      playerProfile: "defensive",
      initialPlayerProfile: "defensive",
      overallTraits: ["defensive"],
      overallSeedMode: "observed",
    };
    const snapshot = calculatePlayerOveralls([player], [round(1, [appearance(player.id, {
      isGoalkeeper: true,
      goalsConceded: 0,
      goals: 4,
      assists: 3,
    })])], fluidProfileFormula).snapshots[0];

    expect(snapshot.positions.DEF.value).toBe(fluidProfileFormula.base);
    expect(snapshot.positions.ATA.value).toBe(fluidProfileFormula.base);
    expect(snapshot.positions.GOL.value).toBeGreaterThan(fluidProfileFormula.base);
  });

  it("ignora o OVR GOL ao escolher a tag fluida da Ranked", () => {
    const player: OverallPlayer = {
      id: "fluid-high-keeper",
      playerProfile: "offensive",
      initialPlayerProfile: "offensive",
      overallTraits: ["offensive"],
      overallSeedMode: "observed",
    };
    const inputs = Array.from({ length: 6 }, (_, index) => round(index + 1, [
      appearance(player.id, {
        matchId: `fluid-line-${index}`,
        goalsConceded: 0,
        teamGoalsConceded: 0,
        isGoalkeeper: false,
      }),
      appearance(player.id, {
        matchId: `fluid-goal-${index}`,
        goalsConceded: 0,
        teamGoalsConceded: 0,
        isGoalkeeper: true,
      }),
    ]));
    const snapshot = calculatePlayerOveralls([player], inputs, parseOverallFormulaConfig({
      ...fluidProfileFormula,
      goalkeeperMaxChangePerRound: 3,
    })).snapshots[0];

    expect(snapshot.positions.GOL.value).toBeGreaterThan(snapshot.positions.ATA.value);
    expect(snapshot.positions.DEF.value).toBeGreaterThan(snapshot.positions.ATA.value);
    expect(snapshot.effectiveProfile).toBe("defensive");
  });

  it("usa o horário de todos os gols para diferenciar derrotas rápidas e tardias", () => {
    const player: OverallPlayer = {
      id: "all-goal-times",
      playerProfile: "defensive",
      initialPlayerProfile: "defensive",
      overallTraits: ["defensive"],
      overallSeedMode: "observed",
    };
    const earlySecondGoal = calculatePlayerOveralls([player], [round(1, [appearance(player.id, {
      goalsConceded: 2,
      teamGoalsConceded: 2,
      concededGoalSeconds: [30, 60],
    })])], fluidProfileFormula).breakdowns[0];
    const lateSecondGoal = calculatePlayerOveralls([player], [round(1, [appearance(player.id, {
      goalsConceded: 2,
      teamGoalsConceded: 2,
      concededGoalSeconds: [30, 390],
    })])], fluidProfileFormula).breakdowns[0];

    expect(lateSecondGoal.defensiveScore).toBeGreaterThan(earlySecondGoal.defensiveScore);
  });

  it("mantém moderado o OVR de 10 jogos, 13 gols sofridos e só 2 jogos sem sofrer", () => {
    const keeper: OverallPlayer = { id: "keeper", playerProfile: "defensive", overallTraits: ["defensive"], overallSeedMode: "observed" };
    const conceded = [0, 0, 1, 1, 1, 2, 2, 2, 2, 2];
    const inputs = conceded.map((goals, index) => round(index + 1, [appearance(keeper.id, {
      matchId: `keeper-${index}`,
      isGoalkeeper: true,
      goalsConceded: goals,
      concededGoalSeconds: goals ? Array.from({ length: goals }, (_, goal) => 140 + goal * 100) : [],
      result: goals < 2 ? "win" : "loss",
    })]));
    const result = calculatePlayerOveralls([keeper], inputs, goalkeeperOutcomeFormula);
    const values = result.snapshotsByRound.map((item) => item.snapshots[0].positions.GOL.value);

    expect(result.snapshots[0].positions.GOL.value).toBeLessThanOrEqual(71);
    expect(values.every((value, index) => index === 0 || Math.abs(value - values[index - 1]) <= 0.81)).toBe(true);
  });
});
