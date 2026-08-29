import { describe, expect, it } from "vitest";
import { roundStartIso } from "./cartola-reminder-scheduler";

describe("roundStartIso", () => {
  it("converte o horário da pelada em São Paulo para UTC", () => {
    expect(roundStartIso("2026-08-29", "20:30")).toBe("2026-08-29T23:30:00.000Z");
  });

  it("aceita horário do banco com segundos", () => {
    expect(roundStartIso("2026-08-29", "08:00:00")).toBe("2026-08-29T11:00:00.000Z");
  });
});
