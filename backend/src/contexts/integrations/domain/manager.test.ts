import { describe, it, expect } from "vitest";
import { validateClubIdentity } from "./manager.js";

describe("Manager Domain", () => {
  it("validates club identity name and abbreviation", () => {
    expect(validateClubIdentity({ name: "A", abbreviation: "AB" }).valid).toBe(false);
    expect(validateClubIdentity({ name: "Clube", abbreviation: "C" }).valid).toBe(false);
    expect(validateClubIdentity({ name: "Clube ABC", abbreviation: "abc", color: "#123abc", crest: "shield", kit: "stripes" }).valid).toBe(true);
  });
});
