import { describe, expect, it } from "vitest";
import { canCreateCallupPrelist, confirmedCallupPlayerIds, type PrelistCallup } from "./callup-prelist";

const callup: PrelistCallup = {
  id: "callup-1", date: "2026-10-17", startTime: "08:00", stadiumId: null,
  stadiumName: null, stadiumMapUrl: null, roundType: "official", status: "open", roundId: null,
  entries: [
    { playerId: "player-1", status: "confirmed" },
    { playerId: "player-2", status: "waitlist" },
    { playerId: "player-3", status: "confirmed" },
  ],
};

describe("pré-lista da convocação", () => {
  it("inclui só os jogadores confirmados na ordem da convocação", () => {
    expect(confirmedCallupPlayerIds(callup)).toEqual(["player-1", "player-3"]);
  });

  it("só cria nova pré-lista com convocação aberta", () => {
    expect(canCreateCallupPrelist(callup)).toBe(true);
    expect(canCreateCallupPrelist({ ...callup, status: "closed" })).toBe(false);
  });
});
