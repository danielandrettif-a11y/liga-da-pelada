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

  it("respeita uma convocacao configurada para tres times de quatro", () => {
    expect(getCallupPlacement(11, 0, 12, 3)).toBe("confirmed");
    expect(getCallupPlacement(12, 0, 12, 3)).toBe("waitlist");
  });

  it("abre 20 vagas para quatro times de cinco", () => {
    expect(getCallupPlacement(19, 0, 20, 3)).toBe("confirmed");
    expect(getCallupPlacement(20, 0, 20, 3)).toBe("waitlist");
  });

  it("abre 18 vagas para tres times de seis", () => {
    expect(getCallupPlacement(17, 0, 18, 3)).toBe("confirmed");
    expect(getCallupPlacement(18, 0, 18, 3)).toBe("waitlist");
  });
});
