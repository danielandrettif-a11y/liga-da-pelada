import { createCard, newManagerState } from "./engine";
import type { AthleteSource, ManagerState, Position } from "./types";

const DEMO_DATE = "2026-09-25T12:00:00.000Z";

/** Fictional fixtures. Never import into an official career. */
export function demoCatalog(): AthleteSource[] {
  const players: [string, Position][] = [
    ["Rafa Campos", "ALA_MEI"], ["Davi Norte", "DEF"], ["Caio Porto", "ATA"],
    ["Bruno Farol", "GOL"], ["Léo Goytacaz", "DEF"], ["Iago Rio", "ALA_MEI"],
    ["Nando Sol", "ATA"], ["Vitor Parque", "GOL"],
  ];
  return players.map(([name, best], index) => ({
    playerId: `demo-athlete-${index}`, name, avatarUrl: null, snapshotId: `demo-snapshot-${index}`,
    formula: "adaptive-v11-balanced-characteristics", capturedAt: DEMO_DATE,
    overall: 74 + index / 10,
    positions: { DEF: 68, ALA_MEI: 69, ATA: 67, GOL: 60, [best]: 74 + index / 10 },
    traits: [best === "ATA" ? "offensive" : best === "ALA_MEI" ? "midfield" : "defensive"],
    goalkeeperEligible: best === "GOL", trend: index % 3 === 0 ? "rising" : index % 3 === 1 ? "steady" : "falling",
    stats: { rounds: 8 + index, goals: index * 2, assists: index + 3 },
  }));
}

export function createDemoState(): ManagerState {
  const state = newManagerState({ name: "Campos Atlético", abbreviation: "CAT", color: "#ccff00", crest: "shield", kit: "stripes" });
  const [rafa] = demoCatalog();
  const main = createCard(rafa, "demo-main", DEMO_DATE, false);
  const superior = structuredClone(rafa);
  superior.positions.ALA_MEI = 77;
  superior.overall = 77;
  superior.snapshotId = "demo-newer-snapshot";
  state.cards = [main, createCard(superior, "demo-superior", DEMO_DATE, false),
    ...Array.from({ length: 4 }, (_, index) => createCard(rafa, `demo-copy-${index}`, DEMO_DATE, false))];
  state.discovered = [rafa];
  state.packs = [
    { id: "demo-choice", kind: "choice", label: "Sua primeira contratação", bound: true, status: "sealed", offers: [] },
    { id: "demo-def", kind: "guaranteed", label: "Reforço da defesa", preferredPosition: "DEF", bound: true, status: "sealed", offers: [] },
    { id: "demo-goalkeeper", kind: "guaranteed", label: "Reforço no gol", preferredPosition: "GOL", bound: true, status: "sealed", offers: [] },
    { id: "demo-pack", kind: "standard", label: "Pacote BQ", bound: false, status: "sealed", offers: [] },
  ];
  return state;
}
