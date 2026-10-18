import { describe, expect, it } from "vitest";
import { lineupSlotsForDatabase, validateFantasyLineupSubmission, type FantasyLineupSubmission } from "./lineup-submission";

const valid: FantasyLineupSubmission = {
  fantasySeasonId: "season-1", roundId: "round-1",
  playerIds: ["one", "two"], captainId: "one", scorerId: null,
  assistId: null, challengeId: null, reservePlayerId: null, reserveRole: null,
  slotAssignments: [
    { playerId: "one", slotIndex: 0, slotRole: "ATA" },
    { playerId: "two", slotIndex: 1, slotRole: "GOL" },
  ],
};

describe("validação da escalação do Cartola", () => {
  it("mantém tamanho, capitão e posições válidos", () => {
    expect(validateFantasyLineupSubmission(valid, 2)).toBeNull();
    expect(lineupSlotsForDatabase(valid)).toEqual([
      { player_id: "one", slot_index: 0, slot_role: "ATA" },
      { player_id: "two", slot_index: 1, slot_role: "GOL" },
    ]);
    expect(validateFantasyLineupSubmission({ ...valid, captainId: null }, 2)).toContain("um capitão");
    expect(validateFantasyLineupSubmission(valid, 3)).toContain("exatamente 3 jogadores");
  });

  it("rejeita titulares repetidos, banco incompleto e titular no banco", () => {
    expect(validateFantasyLineupSubmission({ ...valid, playerIds: ["one", "one"] }, 2)).toContain("inválida");
    expect(validateFantasyLineupSubmission({ ...valid, reservePlayerId: "three" }, 2)).toContain("jogador e a posição");
    expect(validateFantasyLineupSubmission({ ...valid, reservePlayerId: "one", reserveRole: "ATA" }, 2)).toContain("titulares");
  });

  it("rejeita slot repetido, ausente ou posição não permitida", () => {
    expect(validateFantasyLineupSubmission({
      ...valid, slotAssignments: [valid.slotAssignments[0], { ...valid.slotAssignments[1], slotIndex: 0 }],
    }, 2)).toContain("posições");
    expect(validateFantasyLineupSubmission({ ...valid, slotAssignments: valid.slotAssignments.slice(0, 1) }, 2)).toContain("posições");
    expect(validateFantasyLineupSubmission({
      ...valid, slotAssignments: [{ ...valid.slotAssignments[0], slotRole: "MEI" }, valid.slotAssignments[1]],
    }, 2)).toContain("posições");
  });
});
