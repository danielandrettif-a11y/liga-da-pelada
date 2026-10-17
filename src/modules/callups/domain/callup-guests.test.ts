import { describe, expect, it } from "vitest";
import { cleanCallupGuestName } from "./callup-guests";

describe("convidados da convocação", () => {
  it("remove espaços do nome e exige pelo menos duas letras", () => {
    expect(cleanCallupGuestName("  Ana  ")).toBe("Ana");
    expect(cleanCallupGuestName(" A ")).toBeNull();
    expect(cleanCallupGuestName("   ")).toBeNull();
  });
});
