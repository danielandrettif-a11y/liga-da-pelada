import { describe, expect, it } from "vitest";
import { parsePlayerProfileForm, resolvePlayerProfileCommand } from "./player-profile.js";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("player profile domain", () => {
  it("normalizes a multipart profile and validates image signatures", () => {
    expect(parsePlayerProfileForm({
      name: "  Jogador  ", nickname: " BQ ", member_category: "guest",
      player_profile: "midfield", overall_traits: ["midfield", "defensive"],
      activeAvatar: { contentType: "image/png", bytes: png },
    })).toMatchObject({
      name: "Jogador", nickname: "BQ", memberCategory: "guest", playerProfile: "offensive",
      overallTraits: ["offensive", "defensive"], activeAvatar: { slot: "active" },
    });
    expect(() => parsePlayerProfileForm({
      name: "Jogador", member_category: "guest",
      activeAvatar: { contentType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
    })).toThrow("JPG, PNG ou WebP");
  });

  it("lets league admins control category and competitive profile", () => {
    const input = parsePlayerProfileForm({
      name: "Acompanhante", profile_bio: "Bio", member_category: "wag",
      player_profile: "defensive", overall_traits: ["defensive"], is_selectable: "true",
    });
    expect(resolvePlayerProfileCommand("player", input, {
      isLeagueAdmin: true, isOwner: false, current: {
        profileBio: null, avatarUrl: null, avatarAlternateUrl: null, memberCategory: "guest",
        isSelectable: true, playerProfile: "offensive", overallTraits: ["offensive"], isGoalkeeper: true,
      },
    }, null, null)).toMatchObject({
      memberCategory: "wag", isSelectable: false, playerProfile: null, overallTraits: [], isGoalkeeper: false,
    });
  });

  it("limits owners to self-editable identity fields", () => {
    const input = parsePlayerProfileForm({
      name: "Novo nome", profile_bio: "Tentativa", member_category: "guest",
      player_profile: "defensive", overall_traits: ["defensive"], is_selectable: "false",
    });
    expect(resolvePlayerProfileCommand("player", input, {
      isLeagueAdmin: false, isOwner: true, current: {
        profileBio: "Preservada", avatarUrl: null, avatarAlternateUrl: null, memberCategory: "player",
        isSelectable: true, playerProfile: "offensive", overallTraits: ["offensive"], isGoalkeeper: false,
      },
    }, null, null)).toMatchObject({
      name: "Novo nome", profileBio: "Preservada", memberCategory: "player",
      isSelectable: true, playerProfile: "offensive", overallTraits: ["offensive"],
    });
  });

  it("rejects creation of official players from the administrative form", () => {
    const input = parsePlayerProfileForm({ name: "Oficial", member_category: "player" });
    expect(() => resolvePlayerProfileCommand("player", input, {
      isLeagueAdmin: true, isOwner: false, current: null,
    }, null, null)).toThrow("criar o próprio perfil");
  });
});
