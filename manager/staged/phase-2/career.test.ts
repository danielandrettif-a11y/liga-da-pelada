import { describe, expect, it } from "vitest";
import { createCard, newManagerState } from "@/lib/bq-manager/engine";
import { demoCatalog } from "@/lib/bq-manager/demo";
import { DRAFT_BALANCE } from "./balance";
import { beginMatch, buyPack, changeCollection, finishVarzea, initializeCareer, preparationBonus, sellGeneric, seriesDReadiness, setLineup, settleMatch, train, validateLineup } from "./career";
import { canCompleteTutorial, tutorialCandidates } from "./recruitment";
import type { CareerDraft, MatchReport } from "./types";

const base = () => initializeCareer(newManagerState({ name: "Campos FC", abbreviation: "CFC", color: "#00ff88", crest: "shield", kit: "solid" }));
const context = () => ({ catalog: demoCatalog(), now: "2026-09-25T12:00:00Z", random: () => 0, newId: () => "card-1" });
function report(state: CareerDraft, goalsFor = 1, goalsAgainst = 0): MatchReport {
  return {
    ticketId: state.pendingMatch!.id, goalsFor, goalsAgainst,
    players: state.pendingMatch!.lineup.starters.map((p, i) => ({ ...p, minutes: 90, goals: i === 5 ? goalsFor : 0, assists: 0, rating: 7 })),
  };
}
function play(state: CareerDraft, id = `match-${state.round}`): CareerDraft {
  const started = beginMatch(state, id);
  return settleMatch(started, report(started));
}
function completeTutorial(): CareerDraft {
  let state = base();
  for (let i = 1; i <= 8; i++) {
    state = play(state);
    const pack = state.collection.packs.find(p => p.status === "sealed");
    if (!pack) continue;
    state = changeCollection(state, { type: "open-pack", packId: pack.id }, context());
    const opened = state.collection.packs.find(p => p.id === pack.id)!;
    state = changeCollection(state, { type: "claim-pack", packId: pack.id, playerId: opened.offers[0].playerId }, { ...context(), newId: () => `bq-${i}` });
  }
  return state;
}

describe("fase 2 preparada: elenco", () => {
  it("creates nine fictional starters/reserves without altering phase-1 cards", () => {
    const collection = base().collection;
    const state = initializeCareer(collection);
    expect(state.generics).toHaveLength(9);
    expect(new Set(state.generics.map(p => p.id)).size).toBe(9);
    expect(state.collection.cards).toEqual([]);
    expect(state.collection).not.toBe(collection);
    expect(() => validateLineup(state, state.lineup)).not.toThrow();
  });
  it("rejects a repeated BQ athlete even when copies have different IDs", () => {
    const state = base();
    state.collection.cards = [createCard(demoCatalog()[0], "a", context().now, true), createCard(demoCatalog()[0], "b", context().now, true)];
    const lineup = structuredClone(state.lineup);
    lineup.bench = ["a", "b", "generic-9"];
    expect(() => setLineup(state, lineup)).toThrow("mesmo atleta");
  });
  it("rejects missing reserves, cards outside the club and invalid formation", () => {
    const state = base();
    expect(() => setLineup(state, { ...state.lineup, bench: [] })).toThrow("três reservas");
    expect(() => setLineup(state, { ...state.lineup, bench: ["outside", "generic-8", "generic-9"] })).toThrow("seu clube");
    const lineup = structuredClone(state.lineup); lineup.starters[0].position = "ATA";
    expect(() => setLineup(state, lineup)).toThrow("dois DEF");
  });
});

describe("fase 2 preparada: treino e condição", () => {
  it("allows one collective and two different individuals, without a daily clock gate", () => {
    let state = train(base(), "DEF");
    expect(() => train(state, "ATA")).toThrow("coletivo");
    state = train(state, "DEF", "generic-1");
    expect(() => train(state, "DEF", "generic-1")).toThrow("individuais");
    state = train(state, "recovery", "generic-2");
    expect(() => train(state, "recovery", "generic-3")).toThrow("individuais");
    const next = play(state);
    expect(() => train(next, "ATA")).not.toThrow();
  });
  it("shares a +12 progression cap between games/training and never exceeds 99", () => {
    const state = base();
    const card = createCard(demoCatalog()[0], "bq", context().now, true);
    card.training.ALA_MEI = 12;
    state.collection.cards.push(card);
    const trained = train(state, "ALA_MEI", "bq");
    expect(trained.collection.cards[0].training.ALA_MEI).toBe(12);
    state.collection.cards[0].training.ALA_MEI = 0;
    state.collection.cards[0].source.positions.ALA_MEI = 99;
    expect(train(state, "ALA_MEI", "bq").collection.cards[0].training.ALA_MEI).toBe(0);
    expect(state.collection.cards[0].source.positions.ALA_MEI).toBe(99);
  });
  it("records attribute evolution without changing the immutable source", () => {
    const state = base();
    state.collection.cards.push(createCard(demoCatalog()[0], "bq", context().now, true));
    const next = train(state, "ALA_MEI", "bq");
    expect(next.collection.cards[0].training.ALA_MEI).toBe(0.1);
    expect(next.collection.cards[0].attributes.passing).toBe(74.1);
    expect(next.collection.cards[0].source.positions.ALA_MEI).toBe(74);
  });
  it("keeps preparation temporary, with no stacking of collective and individual bonuses", () => {
    const trained = train(train(base(), "DEF"), "DEF", "generic-2");
    expect(preparationBonus(trained, "generic-2", "DEF")).toBe(DRAFT_BALANCE.preparationBonus);
    expect(preparationBonus(play(trained), "generic-2", "DEF")).toBe(0);
  });
  it("permits recovery and the next match at zero coins/condition, preventing pay/energy deadlocks", () => {
    const state = base(); state.coins = 0; state.condition["generic-1"] = 0;
    const recovered = train(state, "recovery", "generic-1");
    expect(recovered.coins).toBe(0);
    expect(recovered.condition["generic-1"]).toBe(15);
    expect(() => beginMatch(recovered, "zero-coins")).not.toThrow();
    expect(() => train(state, "DEF")).toThrow("Saldo");
    expect(state.generics[0].training.DEF).toBe(0);
  });
});

describe("fase 2 preparada: resultados oficiais", () => {
  it("resumes a ticket and blocks roster/economy/training mutations during a match", () => {
    const started = beginMatch(base(), "match");
    expect(beginMatch(started, "match")).toEqual(started);
    expect(() => beginMatch(started, "reroll")).toThrow("Retome");
    expect(() => train(started, "DEF")).toThrow("andamento");
    expect(() => setLineup(started, started.lineup)).toThrow("andamento");
    expect(() => sellGeneric(started, "generic-9")).toThrow("andamento");
  });
  it("settles the same report once and refuses a different result for the same match", () => {
    const started = beginMatch(base(), "match");
    const result = report(started);
    const next = settleMatch(started, result);
    expect(settleMatch(next, result)).toEqual(next);
    expect(settleMatch(next, { ...result, players: [...result.players].reverse() })).toEqual(next);
    expect(next.coins).toBe(DRAFT_BALANCE.initialCoins + DRAFT_BALANCE.matchIncome + DRAFT_BALANCE.winBonus);
    expect(next.collection.packs).toHaveLength(1);
    expect(next.collection.packs[0].kind).toBe("choice");
    expect(next.records["generic-6"].goals).toBe(1);
    expect(() => settleMatch(next, { ...result, goalsAgainst: 5 })).toThrow("definitivo");
  });
  it("rejects a wrong ticket, impossible score and zero-minute scouts", () => {
    const started = beginMatch(base(), "match");
    expect(() => settleMatch(started, { ...report(started), ticketId: "fake" })).toThrow("corresponde");
    expect(() => settleMatch(started, { ...report(started), goalsFor: -1 })).toThrow("Placar");
    const invalid = report(started); invalid.players[0].minutes = 0;
    expect(() => settleMatch(started, invalid)).toThrow("sem minutos");
    expect(started.matches).toEqual([]);
  });
  it("applies fatigue/recovery and retains histories across rounds", () => {
    const next = play(base());
    expect(next.condition["generic-1"]).toBe(95);
    expect(next.condition["generic-9"]).toBe(100);
    expect(next.generics[0].training.GOL).toBe(0.1);
    expect(play(next).records["generic-1"].games).toBe(2);
  });
});

describe("fase 2 preparada: Várzea e recrutamento", () => {
  it("completes eight matches, six different BQ, useful role coverage, and keeps ownership bound", () => {
    const state = completeTutorial();
    expect(state.matches).toHaveLength(8);
    expect(state.collection.cards).toHaveLength(6);
    expect(new Set(state.collection.cards.map(c => c.source.playerId)).size).toBe(6);
    expect(canCompleteTutorial([], state.collection.cards.map(c => c.source))).toBe(true);
    expect(state.collection.cards.every(c => c.bound)).toBe(true);
    expect(seriesDReadiness(state)).toEqual({ ready: true, reasons: [] });
    expect(finishVarzea(state).stage).toBe("ready-for-serie-d");
    expect(() => beginMatch(state, "ninth")).toThrow("concluída");
  });
  it("does not require winning every match to earn the draft tutorial rewards", () => {
    const started = beginMatch(base(), "loss");
    const lost = settleMatch(started, report(started, 0, 2));
    expect(lost.collection.packs).toHaveLength(1);
    expect(lost.coins).toBe(DRAFT_BALANCE.initialCoins + DRAFT_BALANCE.matchIncome);
  });
  it("preserves reward rights if the current BQ catalog cannot cover the positions", () => {
    const state = play(base());
    const id = state.collection.packs[0].id;
    const catalog = demoCatalog().filter(p => !p.goalkeeperEligible);
    expect(() => changeCollection(state, { type: "open-pack", packId: id }, { ...context(), catalog })).toThrow("preservado");
    expect(state.collection.packs[0].status).toBe("sealed");
  });
  it("rejects excessive specialists and can reposition versatile athletes to complete coverage", () => {
    const pool = demoCatalog();
    const attackers = pool.filter(p => p.traits.includes("offensive"));
    expect(canCompleteTutorial(attackers, pool)).toBe(false);
    expect(tutorialCandidates([attackers[0]], pool).some(p => p.playerId === attackers[1].playerId)).toBe(false);
    expect(canCompleteTutorial([], pool)).toBe(true);
  });
  it("requires six owned distinct BQ, not six copies or just album discoveries", () => {
    const state = completeTutorial();
    state.collection.cards = state.collection.cards.map((c, i, cards) => ({ ...c, source: cards[0].source, id: `copy-${i}` }));
    expect(seriesDReadiness(state).ready).toBe(false);
    expect(() => finishVarzea(state)).toThrow("distintos");
  });
});

describe("fase 2 preparada: economia", () => {
  it("deduplicates purchases and rejects insufficient balance without losing coins", () => {
    const state = completeTutorial();
    const next = buyPack(state, "operation-1");
    expect(next.coins).toBe(state.coins - DRAFT_BALANCE.standardPackCost);
    expect(buyPack(next, "operation-1")).toEqual(next);
    state.coins = 0;
    expect(() => buyPack(state, "operation-2")).toThrow("Saldo");
    expect(state.coins).toBe(0);
  });
  it("blocks related-player sales and protects nine DISTINCT athletes", () => {
    const state = base();
    expect(() => sellGeneric(state, "generic-9")).toThrow("Retire");
    state.lineup.bench = [];
    expect(() => sellGeneric(state, "generic-9")).toThrow("nove atletas");
  });
  it("sells an excess generic once, retaining club history", () => {
    const state = completeTutorial();
    const lineup = structuredClone(state.lineup); lineup.starters[0].id = state.collection.cards[0].id;
    const updated = setLineup(state, lineup);
    const next = sellGeneric(updated, "generic-1");
    expect(next.generics).toHaveLength(8);
    expect(next.records["generic-1"].games).toBe(8);
    expect(next.coins).toBe(updated.coins + DRAFT_BALANCE.genericSaleValue);
    expect(sellGeneric(next, "generic-1")).toEqual(next);
  });
  it("cannot buy packs early and accidentally exhaust the six guaranteed recruits", () => {
    expect(() => buyPack(base(), "early")).toThrow("seis contratações");
  });
});
