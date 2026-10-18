import { describe, expect, it } from "vitest";
import {
  checkIncomingSubstitute,
  validateMatchSubstitutionInput,
  validateUndoMatchSubstitutionInput,
} from "./match-substitution";

describe("pré-validação da substituição", () => {
  const valid = { match_id: "match-1", team_id: "team-1", player_out_id: "player-1", reason: "tired" as const };

  it("exige partida, time e jogador que sai", () => {
    expect(validateMatchSubstitutionInput(valid)).toBeNull();
    for (const field of ["match_id", "team_id", "player_out_id"] as const) {
      expect(validateMatchSubstitutionInput({ ...valid, [field]: "" }))
        .toBe("Preencha os dados da substituicao.");
    }
  });

  it("exige substituto da rodada e presença fora do modo manual", () => {
    expect(checkIncomingSubstitute({ found: false, formationMode: null, attendanceStatus: null }))
      .toBe("Substituto nao encontrado nesta rodada.");
    expect(checkIncomingSubstitute({ found: true, formationMode: "automatic", attendanceStatus: "absent" }))
      .toBe("O substituto ainda nao foi marcado como presente.");
    expect(checkIncomingSubstitute({ found: true, formationMode: "automatic", attendanceStatus: "present" }))
      .toBeNull();
    expect(checkIncomingSubstitute({ found: true, formationMode: "manual", attendanceStatus: null }))
      .toBeNull();
  });

  it("exige os dois identificadores para desfazer", () => {
    expect(validateUndoMatchSubstitutionInput("substitution-1", "match-1")).toBeNull();
    expect(validateUndoMatchSubstitutionInput("", "match-1")).toBe("Substituicao invalida.");
    expect(validateUndoMatchSubstitutionInput("substitution-1", "")).toBe("Substituicao invalida.");
  });
});
