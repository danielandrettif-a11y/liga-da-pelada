import { describe, expect, it } from "vitest";
import { getCallupPlacement } from "./callups";

describe("limites da convocacao", () => {
  it("coloca a 15a pessoa entre os confirmados", () => {
    expect(getCallupPlacement(14, 0)).toBe("confirmed");
  });

  it("coloca a 16a e a 18a pessoa na fila", () => {
    expect(getCallupPlacement(15, 0)).toBe("waitlist");
    expect(getCallupPlacement(15, 2)).toBe("waitlist");
  });

  it("recusa a 19a pessoa", () => {
    expect(getCallupPlacement(15, 3)).toBe("full");
  });
});

