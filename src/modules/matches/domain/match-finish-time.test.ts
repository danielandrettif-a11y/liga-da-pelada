import { describe, expect, it } from "vitest";
import { calculateMatchFinishTime } from "./match-finish-time";

describe("tempo no encerramento da partida", () => {
  it("soma o acumulado ao relógio correndo e mantém o deslocamento oficial separado", () => {
    expect(calculateMatchFinishTime({
      timerAccumulatedSeconds: 70,
      timerStartedAt: "2026-10-17T10:00:00.000Z",
      eligibilityElapsedOffsetSeconds: 12,
    }, Date.parse("2026-10-17T10:00:05.900Z"))).toEqual({ elapsedSeconds: 75, officialElapsedSeconds: 87 });
  });

  it("não inventa tempo em relógio pausado nem deixa o tempo negativo", () => {
    expect(calculateMatchFinishTime({
      timerAccumulatedSeconds: 40, timerStartedAt: null, eligibilityElapsedOffsetSeconds: null,
    }, 0)).toEqual({ elapsedSeconds: 40, officialElapsedSeconds: 40 });
    expect(calculateMatchFinishTime({
      timerAccumulatedSeconds: 0, timerStartedAt: "2026-10-17T10:00:05.000Z", eligibilityElapsedOffsetSeconds: 2,
    }, Date.parse("2026-10-17T10:00:00.000Z")))
      .toEqual({ elapsedSeconds: 0, officialElapsedSeconds: 2 });
  });
});
