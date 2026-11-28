import { describe, expect, it } from "vitest";
import {
  InvalidPlayerManagementError,
  normalizeCreatePlayer,
  normalizeGuestNames,
  normalizeUpdatePlayer,
} from "./player-management.js";

describe("player management domain", () => {
  it("normalizes an administratively-created roster member", () => {
    expect(normalizeCreatePlayer({
      name: "  Convidado   BQ  ", nickname: "  BQ  ", member_category: "guest",
      player_profile: "midfield", overall_traits: ["midfield", "defensive", "offensive"],
      is_selectable: false,
    })).toEqual({
      name: "Convidado   BQ", nickname: "BQ", avatarUrl: null, memberCategory: "guest",
      playerProfile: "offensive", primaryPosition: null, secondaryPosition: null,
      overallTraits: ["offensive", "defensive"], isSelectable: true,
    });
  });

  it("keeps partial updates partial and accepts an explicit null avatar", () => {
    expect(normalizeUpdatePlayer({ avatar_url: null, is_selectable: false })).toEqual({
      avatarUrl: null, isSelectable: false,
    });
    expect(normalizeUpdatePlayer({ primary_position: "DEF", secondary_position: null })).toEqual({
      primaryPosition: "DEF", secondaryPosition: null,
    });
    expect(() => normalizeUpdatePlayer({ primary_position: null, secondary_position: "MEI" }))
      .toThrow("Defina a posição primária antes da secundária.");
  });

  it("rejects official-player creation and invalid names", () => {
    expect(() => normalizeCreatePlayer({ name: "Ana", member_category: "player" }))
      .toThrow("precisam criar o próprio perfil");
    expect(() => normalizeUpdatePlayer({ name: "  " })).toThrow(InvalidPlayerManagementError);
  });

  it("normalizes a bounded guest roster", () => {
    expect(normalizeGuestNames(["  Ana   BQ ", "x", 42, "Bruno"])).toEqual(["Ana BQ", "Bruno"]);
    expect(() => normalizeGuestNames([])).toThrow("entre 1 e 100");
    expect(() => normalizeGuestNames(Array.from({ length: 101 }, (_, index) => `Jogador ${index}`)))
      .toThrow("entre 1 e 100");
  });
});
