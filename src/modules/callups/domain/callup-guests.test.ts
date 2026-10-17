import { describe, expect, it } from "vitest";
import { canRemoveCreatedCallupEntry, cleanCallupGuestName } from "./callup-guests";

describe("convidados da convocação", () => {
  it("remove espaços do nome e exige pelo menos duas letras", () => {
    expect(cleanCallupGuestName("  Ana  ")).toBe("Ana");
    expect(cleanCallupGuestName(" A ")).toBeNull();
    expect(cleanCallupGuestName("   ")).toBeNull();
  });

  it("permite retirar somente a entrada adicionada ou o perfil criado pela conta", () => {
    expect(canRemoveCreatedCallupEntry("user-1", { joinedBy: "user-1", createdByUserId: null })).toBe(true);
    expect(canRemoveCreatedCallupEntry("user-1", { joinedBy: null, createdByUserId: "user-1" })).toBe(true);
    expect(canRemoveCreatedCallupEntry("user-1", { joinedBy: "user-2", createdByUserId: "user-3" })).toBe(false);
  });
});
