import { describe, expect, it } from "vitest";
import {
  getFantasyReserveBudgetAdjustment,
  getFantasyReservePriceLimit,
  getFantasyReserveUpfrontCost,
  resolveFantasyReserveSubstitution,
} from "./reserve";

describe("banco de reserva do Cartola", () => {
  const starters = [
    { playerId: "ata-1", slotRole: "ATA" as const, basePoints: 0, totalPoints: 0, slotIndex: 0 },
    { playerId: "ata-2", slotRole: "ATA" as const, basePoints: -3, totalPoints: -3, slotIndex: 1 },
    { playerId: "def-1", slotRole: "DEF" as const, basePoints: -4, totalPoints: -4, slotIndex: 3 },
    { playerId: "gol-1", slotRole: "GOL" as const, basePoints: -2, totalPoints: -2, slotIndex: 4 },
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

  it("escolhe a pior pontuação base mesmo quando o multiplicador deixa o capitão mais negativo", () => {
    const resolution = resolveFantasyReserveSubstitution({
      reserveRole: "ATA",
      reservePoints: 2,
      captainMultiplier: 2,
      starters: [
        { playerId: "titular", slotRole: "ATA", basePoints: -3, totalPoints: -3, slotIndex: 0 },
        {
          playerId: "capitao",
          slotRole: "ATA",
          basePoints: -2,
          totalPoints: -4,
          captainBonus: -2,
          isCaptain: true,
          slotIndex: 1,
        },
      ],
    });

    expect(resolution.replacedPlayerId).toBe("titular");
    expect(resolution.captainInherited).toBe(false);
  });

  it("não mistura ATA com DEF", () => {
    expect(resolveFantasyReserveSubstitution({ reserveRole: "DEF", reservePoints: -3, starters }).replacedPlayerId).toBe("def-1");
  });

  it("permite reserva GOL e troca somente o titular da vaga de goleiro", () => {
    expect(resolveFantasyReserveSubstitution({ reserveRole: "GOL", reservePoints: 4, starters })).toMatchObject({
      applied: true,
      replacedPlayerId: "gol-1",
      pointsGain: 6,
    });
  });

  it("não entra se não superar o titular ou se todos forem positivos", () => {
    expect(resolveFantasyReserveSubstitution({ reserveRole: "ATA", reservePoints: -3, starters }).applied).toBe(false);
    expect(resolveFantasyReserveSubstitution({
      reserveRole: "ATA",
      reservePoints: 10,
      starters: [{ playerId: "ata", slotRole: "ATA", basePoints: 1, totalPoints: 1, slotIndex: 0 }],
    }).applied).toBe(false);
  });

  it("limita o preço cheio a dez centavos abaixo do titular mais barato da posição", () => {
    const starters = [
      { slotRole: "ATA" as const, price: 12 },
      { slotRole: "ATA" as const, price: 10 },
      { slotRole: "DEF" as const, price: 8 },
      { slotRole: "GOL" as const, price: 7 },
    ];

    expect(getFantasyReservePriceLimit("ATA", starters)).toBe(9.9);
    expect(getFantasyReservePriceLimit("DEF", starters)).toBe(7.9);
    expect(getFantasyReservePriceLimit("GOL", starters)).toBe(6.9);
    expect(getFantasyReservePriceLimit("ATA", [{ slotRole: "DEF", price: 10 }])).toBeNull();
  });

  it("não consome patrimônio durante a escalação", () => {
    expect(getFantasyReserveUpfrontCost()).toBe(0);
  });

  it("só troca a valorização quando o reserva realmente entra", () => {
    const prices = {
      starterPriceLocked: 10,
      starterPriceAfter: 11,
      reservePriceLocked: 8,
      reservePriceAfter: 8.5,
    };

    expect(getFantasyReserveBudgetAdjustment({ applied: false, ...prices })).toBe(0);
    expect(getFantasyReserveBudgetAdjustment({ applied: true, ...prices })).toBe(-0.5);
  });

  it("devolve a diferença de entrada sem criar ou destruir patrimônio", () => {
    expect(getFantasyReserveBudgetAdjustment({
      applied: true,
      starterPriceLocked: 10,
      starterPriceAfter: 10,
      reservePriceLocked: 8,
      reservePriceAfter: 8,
    })).toBe(0);
  });
});
