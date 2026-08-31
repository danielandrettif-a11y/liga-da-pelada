import { describe, expect, it } from "vitest";
import { isPlayerVisibleInPrelistTab, labelCallupTabs } from "./callup-ui";

describe("labelCallupTabs", () => {
  it("numera Ranked e Amistoso de forma independente", () => {
    const callups = labelCallupTabs([
      { id: "r1", round_type: "official" as const },
      { id: "f1", round_type: "friendly" as const },
      { id: "r2", round_type: "official" as const },
    ]);

    expect(callups.map((callup) => callup.tabLabel)).toEqual([
      "Ranked 1",
      "Amistoso 1",
      "Ranked 2",
    ]);
  });
});

describe("isPlayerVisibleInPrelistTab", () => {
  const selected = new Set(["confirmado"]);
  const callupEntries = new Set(["confirmado", "fila"]);

  it("mostra somente confirmados na aba Selecionados", () => {
    expect(isPlayerVisibleInPrelistTab("confirmado", selected, callupEntries, "selected")).toBe(true);
    expect(isPlayerVisibleInPrelistTab("fila", selected, callupEntries, "selected")).toBe(false);
  });

  it("não devolve confirmados nem pessoas da fila para Disponíveis", () => {
    expect(isPlayerVisibleInPrelistTab("confirmado", selected, callupEntries, "available")).toBe(false);
    expect(isPlayerVisibleInPrelistTab("fila", selected, callupEntries, "available")).toBe(false);
    expect(isPlayerVisibleInPrelistTab("livre", selected, callupEntries, "available")).toBe(true);
  });
});
