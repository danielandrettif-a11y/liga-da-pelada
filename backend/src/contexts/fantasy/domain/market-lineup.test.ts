import { describe, expect, it } from "vitest";
import {
  calculateCostBenefitRatio,
  validateLineupSubmission,
  type FantasyLineupSlot,
} from "./market-lineup.js";

describe("Fantasy Domain: Market & Lineup", () => {
  it("rejects lineup submission when market is closed", () => {
    const result = validateLineupSubmission({
      slots: [{ slotRole: "ATA", playerId: "p1" }],
      captainPlayerId: "p1",
      availableBudget: 100,
      playerPrices: new Map([["p1", 10]]),
      isMarketOpen: false,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("mercado está fechado");
  });

  it("rejects duplicate players in slots", () => {
    const slots: FantasyLineupSlot[] = [
      { slotRole: "MEI", playerId: "p1" },
      { slotRole: "ATA", playerId: "p1" },
    ];
    const result = validateLineupSubmission({
      slots,
      captainPlayerId: "p1",
      availableBudget: 100,
      playerPrices: new Map([["p1", 10]]),
      isMarketOpen: true,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("mesmo atleta");
  });

  it("rejects captain not in lineup", () => {
    const slots: FantasyLineupSlot[] = [
      { slotRole: "MEI", playerId: "p1" },
      { slotRole: "ATA", playerId: "p2" },
    ];
    const result = validateLineupSubmission({
      slots,
      captainPlayerId: "p3",
      availableBudget: 100,
      playerPrices: new Map([
        ["p1", 10],
        ["p2", 12],
      ]),
      isMarketOpen: true,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("capitão selecionado deve estar");
  });

  it("rejects when total cost exceeds available budget using integer cents", () => {
    const slots: FantasyLineupSlot[] = [
      { slotRole: "MEI", playerId: "p1" },
      { slotRole: "ATA", playerId: "p2" },
    ];
    const result = validateLineupSubmission({
      slots,
      captainPlayerId: "p1",
      availableBudget: 20.0,
      playerPrices: new Map([
        ["p1", 10.5],
        ["p2", 10.0],
      ]),
      isMarketOpen: true,
    });

    expect(result.valid).toBe(false);
    expect(result.totalCost).toBe(20.5);
    expect(result.error).toContain("Orçamento insuficiente");
  });

  it("accepts valid lineup submission within budget", () => {
    const slots: FantasyLineupSlot[] = [
      { slotRole: "GOL", playerId: "p1" },
      { slotRole: "DEF", playerId: "p2" },
      { slotRole: "MEI", playerId: "p3" },
      { slotRole: "ATA", playerId: "p4" },
    ];
    const result = validateLineupSubmission({
      slots,
      captainPlayerId: "p4",
      availableBudget: 50.0,
      playerPrices: new Map([
        ["p1", 8.0],
        ["p2", 7.5],
        ["p3", 10.0],
        ["p4", 12.0],
      ]),
      isMarketOpen: true,
    });

    expect(result.valid).toBe(true);
    expect(result.totalCost).toBe(37.5);
    expect(result.error).toBeUndefined();
  });

  it("calculates cost benefit ratio rounded to 2 decimals", () => {
    expect(calculateCostBenefitRatio(15.5, 10.0)).toBe(1.55);
    expect(calculateCostBenefitRatio(10, 0)).toBe(0);
  });
});

