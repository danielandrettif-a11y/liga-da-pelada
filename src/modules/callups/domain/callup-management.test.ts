import { describe, expect, it } from "vitest";
import { isCallupRosterComplete } from "./callup-management";

describe("lotação da convocação", () => {
  it("só permite montar a rodada com a quantidade exata de confirmados", () => {
    expect(isCallupRosterComplete(21, 21)).toBe(true);
    expect(isCallupRosterComplete(21, 20)).toBe(false);
    expect(isCallupRosterComplete(21, 22)).toBe(false);
  });
});
