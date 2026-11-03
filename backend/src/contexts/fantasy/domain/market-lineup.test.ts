import { describe, expect, it } from "vitest";
import { calculateCostBenefitRatio, validateLineupSubmission, type FantasyLineupSlot } from "./market-lineup.js";

function validate(slots: FantasyLineupSlot[], captainId: string, budget = 100, open = true) {
  return validateLineupSubmission({
    input: { roundId: "r1", playerIds: slots.map((slot) => slot.playerId), slotAssignments: slots, captainId },
    playersPerTeam: slots.length,
    availableBudget: budget,
    playerPrices: new Map([["p1", 10.5], ["p2", 10], ["p3", 10], ["p4", 12]]),
    isMarketOpen: open,
  });
}

describe("Fantasy Domain: Market & Lineup", () => {
  it("rejects lineup submission when market is closed", () => {
    const result = validate([{ slotRole: "ATA", slotIndex: 0, playerId: "p1" }], "p1", 100, false);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("mercado está fechado");
  });

  it("rejects duplicate players in slots", () => {
    const result = validate([
      { slotRole: "DEF", slotIndex: 0, playerId: "p1" },
      { slotRole: "ATA", slotIndex: 1, playerId: "p1" },
    ], "p1");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("mesmo atleta");
  });

  it("rejects captain not in lineup", () => {
    const result = validate([
      { slotRole: "DEF", slotIndex: 0, playerId: "p1" },
      { slotRole: "ATA", slotIndex: 1, playerId: "p2" },
    ], "p3");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("capitão selecionado deve estar");
  });

  it("rejects when total cost exceeds available budget using integer cents", () => {
    const result = validate([
      { slotRole: "DEF", slotIndex: 0, playerId: "p1" },
      { slotRole: "ATA", slotIndex: 1, playerId: "p2" },
    ], "p1", 20);
    expect(result.valid).toBe(false);
    expect(result.totalCost).toBe(20.5);
  });

  it("preserves reserve validation and accepts a complete lineup", () => {
    const slots: FantasyLineupSlot[] = [
      { slotRole: "GOL", slotIndex: 0, playerId: "p1" },
      { slotRole: "DEF", slotIndex: 1, playerId: "p2" },
      { slotRole: "ATA", slotIndex: 2, playerId: "p3" },
      { slotRole: "ATA", slotIndex: 3, playerId: "p4" },
    ];
    const result = validate(slots, "p4", 50);
    expect(result).toEqual({ valid: true, totalCost: 42.5 });
    const invalidReserve = validateLineupSubmission({
      input: { roundId: "r1", playerIds: slots.map((slot) => slot.playerId), slotAssignments: slots,
        captainId: "p4", reservePlayerId: "reserve", reserveRole: null },
      playersPerTeam: 4, availableBudget: 50,
      playerPrices: new Map([["p1", 8], ["p2", 7.5], ["p3", 10], ["p4", 12]]), isMarketOpen: true,
    });
    expect(invalidReserve.valid).toBe(false);
    expect(invalidReserve.error).toContain("banco de reserva");
  });

  it("calculates cost benefit ratio rounded to 2 decimals", () => {
    expect(calculateCostBenefitRatio(15.5, 10)).toBe(1.55);
    expect(calculateCostBenefitRatio(10, 0)).toBe(0);
  });
});
