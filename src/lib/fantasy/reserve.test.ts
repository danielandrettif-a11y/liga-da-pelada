import { describe, expect, it } from "vitest";
import { resolveFantasyReserveSubstitution } from "./reserve";

describe("banco de reserva do Cartola", () => {
  const starters = [
    { playerId: "ata-1", slotRole: "ATA" as const, basePoints: 0, totalPoints: 0, slotIndex: 0 },
    { playerId: "ata-2", slotRole: "ATA" as const, basePoints: -3, totalPoints: -3, slotIndex: 1 },
    { playerId: "def-1", slotRole: "DEF" as const, basePoints: -4, totalPoints: -4, slotIndex: 3 },
  ];

  it("troca a pior nota não positiva da mesma posição", () => {
    expect(resolveFantasyReserveSubstitution({ reserveRole: "ATA", reservePoints: 3, starters })).toMatchObject({
      applied: true,
      replacedPlayerId: "ata-2",
      replacedPlayerPoints: -3,
      reservePoints: 3,
      reserveTotalPoints: 3,
      playerPointsGain: 6,
      captainBonusGain: 0,
      pointsGain: 6,
      captainInherited: false,
    });
  });

  it("transfere a faixa de capitão quando substitui o capitão", () => {
    const resolution = resolveFantasyReserveSubstitution({
      reserveRole: "ATA",
      reservePoints: 4,
      captainMultiplier: 1.5,
      starters: [{
        playerId: "captain",
        slotRole: "ATA",
        basePoints: -2,
        totalPoints: -3,
        captainBonus: -1,
        isCaptain: true,
        slotIndex: 0,
      }],
    });

    expect(resolution).toMatchObject({
      applied: true,
      captainInherited: true,
      reserveTotalPoints: 6,
      playerPointsGain: 6,
      captainBonusGain: 3,
      pointsGain: 9,
    });
  });

  it("não mistura ATA com DEF", () => {
    expect(resolveFantasyReserveSubstitution({ reserveRole: "DEF", reservePoints: -3, starters }).replacedPlayerId).toBe("def-1");
  });

  it("não entra se não superar o titular ou se todos forem positivos", () => {
    expect(resolveFantasyReserveSubstitution({ reserveRole: "ATA", reservePoints: -3, starters }).applied).toBe(false);
    expect(resolveFantasyReserveSubstitution({
      reserveRole: "ATA",
      reservePoints: 10,
      starters: [{ playerId: "ata", slotRole: "ATA", basePoints: 1, totalPoints: 1, slotIndex: 0 }],
    }).applied).toBe(false);
  });
});