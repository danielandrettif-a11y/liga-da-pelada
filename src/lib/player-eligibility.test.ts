import { describe, expect, it } from "vitest";
import { isCompetitiveProfileComplete } from "./player-eligibility";

const complete = {
  name: "Jogador",
  avatar_url: "https://example.com/avatar.jpg",
  player_profile: "midfield" as const,
  overall_traits: ["midfield" as const],
  member_category: "player" as const,
  is_selectable: true,
};

describe("isCompetitiveProfileComplete", () => {
  it("aceita jogador oficial com nome, foto, posição e até três estilos", () => {
    expect(isCompetitiveProfileComplete(complete)).toBe(true);
    expect(isCompetitiveProfileComplete({ ...complete, overall_traits: ["offensive", "defensive"] })).toBe(true);
    expect(isCompetitiveProfileComplete({ ...complete, overall_traits: ["offensive", "midfield", "defensive"] })).toBe(true);
  });

  it("recusa perfil sem foto ou sem estilo", () => {
    expect(isCompetitiveProfileComplete({ ...complete, avatar_url: null })).toBe(false);
    expect(isCompetitiveProfileComplete({ ...complete, overall_traits: [] })).toBe(false);
  });

  it("prioriza a coluna calculada pelo banco quando ela estiver presente", () => {
    expect(isCompetitiveProfileComplete({ ...complete, is_competitive_profile_complete: false })).toBe(false);
  });
});
