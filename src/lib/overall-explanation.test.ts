import { describe, expect, it } from "vitest";
import { getOverallComposition } from "./overall-explanation";

const positions = {
  DEF: 73.1,
  ALA_MEI: 70.5,
  ATA: 69.7,
  GOL: 73.5,
};

describe("getOverallComposition", () => {
  it("reproduz o OVR do Lucas usando somente DEF/VOL e ATA", () => {
    const result = getOverallComposition(["offensive", "defensive"], positions);

    expect(result?.items.map((item) => [item.role, item.weight])).toEqual([
      ["DEF", 0.7],
      ["ATA", 0.3],
    ]);
    expect(result?.value).toBe(72.1);
  });

  it("reproduz o OVR do Matheus usando DEF/VOL e ALA", () => {
    const result = getOverallComposition(["midfield", "defensive"], {
      DEF: 73.1,
      ALA_MEI: 70.2,
      ATA: 67.9,
      GOL: 73.4,
    });

    expect(result?.items.map((item) => [item.role, item.weight])).toEqual([
      ["DEF", 0.7],
      ["ALA_MEI", 0.3],
    ]);
    expect(result?.value).toBe(72.2);
  });

  it("não inventa OVR geral sem características definidas", () => {
    expect(getOverallComposition([], positions)).toBeNull();
  });

  it("explica quando o OVR GOL assume o geral de um goleiro elegível", () => {
    const result = getOverallComposition(["defensive"], { ...positions, GOL: 76.4 }, {
      isGoalkeeper: true,
      overall: 76.4,
    });

    expect(result).toMatchObject({
      source: "goalkeeper",
      value: 76.4,
      items: [{ role: "GOL", weight: 1 }],
    });
  });
});
