import { describe, expect, it } from "vitest";
import { formatGoalTime } from "./goal-time";

describe("formatGoalTime", () => {
  it("mostra o segundo exato durante o tempo regulamentar", () => {
    expect(formatGoalTime({ elapsed_seconds: 419, minute: 6 })).toBe("6:59");
    expect(formatGoalTime({ elapsed_seconds: 420, minute: 7 })).toBe("7:00");
  });

  it("separa o acréscimo depois de sete minutos", () => {
    expect(formatGoalTime({ elapsed_seconds: 421, minute: 7 })).toBe("7:00 + 0:01");
    expect(formatGoalTime({ elapsed_seconds: 503, minute: 8 })).toBe("7:00 + 1:23");
  });

  it("identifica como aproximado o histórico que só possui minuto", () => {
    expect(formatGoalTime({ minute: 6 })).toBe("6' (aprox.)");
    expect(formatGoalTime({ minute: 9 })).toBe("7' + 2' (aprox.)");
  });

  it("não inventa horário quando o registro não possui tempo", () => {
    expect(formatGoalTime({})).toBeNull();
  });
});
