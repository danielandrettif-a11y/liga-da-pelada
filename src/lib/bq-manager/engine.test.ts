import { describe, expect, it } from "vitest";
import { cardOverall, cardPositions, composedOverall, createCard, executeCommand, formBonus, fusionPreview, newManagerState } from "./engine";
import { createDemoState, demoCatalog } from "./demo";
import { readManagerConfig } from "./config";
import type { ManagerCommand, ManagerState } from "./types";

const context = () => ({ catalog: demoCatalog(), now: "2026-09-25T15:00:00Z", newId: () => "new-card", random: () => 0.1 });
const inheritance: Extract<ManagerCommand, { type: "fuse" }> = { type: "fuse", targetId: "demo-main", donorIds: ["demo-superior"], position: "ALA_MEI", mode: "inherit" };
const four: typeof inheritance = { ...inheritance, mode: "four", donorIds: Array.from({ length: 4 }, (_, i) => `demo-copy-${i}`) };

describe("BQ Manager: independent database", () => {
  it("never falls back to the app database and rejects its URL", () => {
    expect(readManagerConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://app.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "app-key" })).toBeNull();
    expect(() => readManagerConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://app.supabase.co", BQ_MANAGER_SUPABASE_URL: "https://app.supabase.co/", BQ_MANAGER_SUPABASE_SERVICE_ROLE_KEY: "key" })).toThrow("separado");
    expect(readManagerConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://app.supabase.co", BQ_MANAGER_SUPABASE_URL: "https://game.supabase.co", BQ_MANAGER_SUPABASE_SERVICE_ROLE_KEY: "game-key" })?.url).toBe("https://game.supabase.co");
  });
  it("validates club identity without granting rewards before Várzea", () => {
    const state = newManagerState({ name: "  Campos   Atlético ", abbreviation: "cat", color: "#ccff00", crest: "shield", kit: "solid" });
    expect(state.club.name).toBe("Campos Atlético");
    expect(state.club.abbreviation).toBe("CAT");
    expect(state.cards).toEqual([]);
    expect(state.packs).toEqual([]);
    expect(() => newManagerState({ ...state.club, color: "url(evil)" })).toThrow();
    expect(() => newManagerState({ ...state.club, name: " " })).toThrow();
  });
});

describe("BQ Manager: OVR snapshots", () => {
  it("preserves source OVR, positions, traits and public stats after app changes", () => {
    const source = demoCatalog()[0];
    const card = createCard(source, "one", context().now, false);
    source.positions.ALA_MEI = 99; source.overall = 99; source.traits.push("offensive"); source.stats.goals = 99;
    expect(cardOverall(card)).toBe(74);
    expect(cardPositions(card).ALA_MEI).toBe(74);
    expect(card.source.traits).toEqual(["midfield"]);
    expect(card.source.stats.goals).toBe(0);
  });
  it("reproduces the Lucas/Matheus difference using characteristics, not all four positions", () => {
    const source = demoCatalog()[0];
    expect(composedOverall({ ...source, traits: ["offensive", "defensive"] }, { DEF: 73.1, ALA_MEI: 70.5, ATA: 69.7, GOL: 73.5 })).toBe(72.1);
    expect(composedOverall({ ...source, traits: ["midfield", "defensive"] }, { DEF: 73.1, ALA_MEI: 70.2, ATA: 67.9, GOL: 73.4 })).toBe(72.2);
  });
  it("uses 60/25/15 for three traits and never infers GK eligibility from a high GOL alone", () => {
    const source = { ...demoCatalog()[0], traits: ["defensive", "midfield", "offensive"] as const };
    const positions = { DEF: 80, ALA_MEI: 70, ATA: 60, GOL: 90 };
    expect(composedOverall({ ...source, traits: [...source.traits] }, positions)).toBe(74.5);
    expect(composedOverall({ ...source, traits: [...source.traits], goalkeeperEligible: true }, positions)).toBe(90);
  });
  it("keeps the v13 card composition aligned with the public 50/35/15 overall", () => {
    const source = { ...demoCatalog()[0], formula: "adaptive-v13-admin-style-evidence" };
    expect(composedOverall(source, { DEF: 73.1, ALA_MEI: 70.5, ATA: 69.7, GOL: 90 })).toBe(71.7);
    expect(composedOverall({ ...source, goalkeeperEligible: true }, { DEF: 73.1, ALA_MEI: 70.5, ATA: 69.7, GOL: 90 })).toBe(81.2);
  });
  it("keeps live form separate from permanent overall; missing source has no bonus", () => {
    const card = createDemoState().cards[0];
    expect([formBonus("rising"), formBonus("steady"), formBonus("falling"), formBonus()]).toEqual([2, 0, -2, 0]);
    expect(cardOverall(card)).toBe(74);
  });
});

describe("BQ Manager: packs", () => {
  it("persists three distinct offers and rejects rerolling by repeated open", () => {
    const state = createDemoState();
    const next = executeCommand(state, { type: "open-pack", packId: "demo-choice" }, context());
    const offers = next.packs[0].offers;
    expect(new Set(offers.map(offer => offer.playerId)).size).toBe(3);
    expect(offers.some(offer => offer.playerId === "demo-athlete-0")).toBe(false);
    const repeated = executeCommand(next, { type: "open-pack", packId: "demo-choice" }, { ...context(), random: () => 0.99 });
    expect(repeated).toEqual(next);
    expect(state.packs[0].status).toBe("sealed");
  });
  it("claims once, freezes the offer even if source changes, and refuses invented selections", () => {
    const state = executeCommand(createDemoState(), { type: "open-pack", packId: "demo-choice" }, context());
    const chosen = state.packs[0].offers[0];
    const command = { type: "claim-pack", packId: "demo-choice", playerId: chosen.playerId } as const;
    expect(() => executeCommand(state, { ...command, playerId: "invented" }, context())).toThrow("oferecidas");
    const next = executeCommand(state, command, { ...context(), catalog: [] });
    expect(next.cards).toHaveLength(7);
    expect(next.cards.at(-1)?.source).toEqual(chosen);
    expect(next.discovered).toHaveLength(2);
    expect(executeCommand(next, command, context())).toEqual(next);
  });
  it("does not consume a pack when there are too few eligible athletes", () => {
    const state = createDemoState();
    expect(() => executeCommand(state, { type: "open-pack", packId: "demo-choice" }, { ...context(), catalog: demoCatalog().slice(0, 2) })).toThrow("preservado");
    expect(state.packs[0].status).toBe("sealed");
  });
  it("serializes offers so guaranteed discoveries cannot be duplicated by two open packs", () => {
    const state = executeCommand(createDemoState(), { type: "open-pack", packId: "demo-choice" }, context());
    expect(() => executeCommand(state, { type: "open-pack", packId: "demo-def" }, context())).toThrow("Conclua");
  });
  it("guarantees six distinct athletes across the six tutorial rewards", () => {
    let state: ManagerState = { ...createDemoState(), cards: [], discovered: [], packs: Array.from({ length: 6 }, (_, index) => ({ id: `p${index}`, kind: index === 0 ? "choice" : "guaranteed", label: "Tutorial", bound: true, status: "sealed", offers: [] })) };
    for (let index = 0; index < 6; index++) {
      state = executeCommand(state, { type: "open-pack", packId: `p${index}` }, context());
      const playerId = state.packs[index].offers[0].playerId;
      state = executeCommand(state, { type: "claim-pack", packId: `p${index}`, playerId }, { ...context(), newId: () => `c${index}` });
    }
    expect(new Set(state.cards.map(card => card.source.playerId)).size).toBe(6);
    expect(state.cards.every(card => card.bound)).toBe(true);
  });
  it("honors a targeted GK reward and rejects opening packs not owned", () => {
    const state = executeCommand(createDemoState(), { type: "open-pack", packId: "demo-goalkeeper" }, context());
    expect(state.packs[2].offers[0].goalkeeperEligible).toBe(true);
    expect(() => executeCommand(state, { type: "open-pack", packId: "someone-elses-pack" }, context())).toThrow("pertence");
  });
});

describe("BQ Manager: fusions", () => {
  it("raises a position TO the donor source, without stacking existing training twice", () => {
    const state = createDemoState();
    state.cards[0].training.ALA_MEI = 1;
    const next = executeCommand(state, inheritance, context());
    expect(cardPositions(next.cards[0]).ALA_MEI).toBe(77);
    expect(next.cards[0].inherited.ALA_MEI).toBe(2);
    expect(next.cards[0].training.ALA_MEI).toBe(1);
    expect(next.cards[0].source.positions.ALA_MEI).toBe(74);
    expect(next.cards[0].fusion.ALA_MEI).toBe(0);
    expect(next.cards).toHaveLength(5);
    expect(next.discovered).toEqual(state.discovered);
  });
  it("does not inherit training/fusion gains from a donor", () => {
    const state = createDemoState();
    state.cards[2].training.ALA_MEI = 12;
    expect(() => fusionPreview(state, { ...inheritance, donorIds: [state.cards[2].id] })).toThrow("ORIGINAL");
  });
  it("consumes exactly four inferior copies, keeps discovery and recalculates overall", () => {
    const next = executeCommand(createDemoState(), four, context());
    expect(next.cards).toHaveLength(2);
    expect(cardOverall(next.cards[0])).toBe(76);
    expect(next.discovered).toHaveLength(1);
    expect(() => executeCommand(next, four, context())).toThrow("pertençam");
  });
  it("caps four-copy fusion at +8 across all positions and prevents clipping above 99", () => {
    const state = createDemoState();
    state.cards[0].fusion = { DEF: 4, ALA_MEI: 0, ATA: 2, GOL: 2 };
    expect(() => fusionPreview(state, four)).toThrow("+8");
    state.cards[0].fusion = { DEF: 0, ALA_MEI: 0, ATA: 0, GOL: 0 };
    state.cards[0].source.positions.ALA_MEI = 98;
    expect(() => fusionPreview(state, four)).toThrow("99");
  });
  it("rejects superior donors in a four-copy fusion, repeated IDs, the target and foreign athletes", () => {
    const state = createDemoState();
    expect(() => fusionPreview(state, { ...four, donorIds: ["demo-superior", ...four.donorIds.slice(1)] })).toThrow("superior");
    expect(() => fusionPreview(state, { ...four, donorIds: Array(4).fill("demo-copy-0") })).toThrow("diferente");
    expect(() => fusionPreview(state, { ...inheritance, donorIds: ["demo-main"] })).toThrow("principal");
    state.cards[1].source.playerId = "different-athlete";
    expect(() => fusionPreview(state, inheritance)).toThrow("mesmo atleta");
  });
  it("keeps a bound donor from laundering its gains into a tradeable card", () => {
    const state = createDemoState();
    state.cards[1].bound = true;
    expect(fusionPreview(state, inheritance).card.bound).toBe(true);
  });
});
