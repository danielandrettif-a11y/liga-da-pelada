import { describe, expect, it } from "vitest";
import { canAdminAssignOfficialCategory } from "./player-member-category";

describe("canAdminAssignOfficialCategory", () => {
  it("permite manter um jogador oficial ou promover um convidado existente", () => {
    expect(canAdminAssignOfficialCategory("player-id", "player")).toBe(true);
    expect(canAdminAssignOfficialCategory("guest-id", "guest")).toBe(true);
  });

  it("nao permite criar um oficial diretamente nem promover categorias da comunidade", () => {
    expect(canAdminAssignOfficialCategory(null, "guest")).toBe(false);
    expect(canAdminAssignOfficialCategory("wag-id", "wag")).toBe(false);
    expect(canAdminAssignOfficialCategory("supporter-id", "supporter")).toBe(false);
  });
});
