import { describe, expect, it } from "vitest";
import { compareFantasyRoundPriority } from "./fantasy-round-order";

const now = new Date("2026-10-12T12:00:00Z");
const round = (date: string, market_status = "open", start_time = "08:00") => ({
  market_status, round: { date, start_time },
});

describe("prioridade da rodada do Cartola", () => {
  it("escolhe a próxima convocação, não a mais distante", () => {
    const candidates = [round("2026-10-20"), round("2026-10-13"), round("2026-10-15")];
    expect(candidates.sort((a, b) => compareFantasyRoundPriority(a, b, now))[0].round.date).toBe("2026-10-13");
  });

  it("mantém a rodada em andamento acima de uma futura", () => {
    const candidates = [round("2026-10-13"), round("2026-10-12", "in_progress")];
    expect(candidates.sort((a, b) => compareFantasyRoundPriority(a, b, now))[0].market_status).toBe("in_progress");
  });

  it("prefere o futuro ao mercado aberto antigo e respeita o horário", () => {
    const candidates = [round("2026-10-11"), round("2026-10-13", "open", "10:00"), round("2026-10-13", "open", "08:00")];
    expect(candidates.sort((a, b) => compareFantasyRoundPriority(a, b, now))[0].round.start_time).toBe("08:00");
  });

  it("prioriza a convocação ativa quando há também pré-lista manual", () => {
    const manual = round("2026-10-13");
    const callup = { ...round("2026-10-15"), round: { date: "2026-10-15", start_time: "08:00", callups: [{ status: "open" }] } };
    expect([manual, callup].sort((a, b) => compareFantasyRoundPriority(a, b, now))[0]).toBe(callup);
  });
});
