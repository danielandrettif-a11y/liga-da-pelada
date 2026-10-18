import { describe, expect, it, vi } from "vitest";
import { undoMatchSubstitution, type UndoMatchSubstitutionGateway } from "./undo-match-substitution";

function gateway(): UndoMatchSubstitutionGateway & {
  loadSelectedMatchRoundId: ReturnType<typeof vi.fn>;
  isSubstitutionInMatch: ReturnType<typeof vi.fn>;
  undo: ReturnType<typeof vi.fn>;
} {
  return {
    loadSelectedMatchRoundId: vi.fn().mockResolvedValue("round-1"),
    isSubstitutionInMatch: vi.fn().mockResolvedValue(true),
    undo: vi.fn().mockResolvedValue(undefined),
  };
}

describe("desfazer a ultima substituição", () => {
  it("rejeita identificadores ausentes antes de consultar a partida", async () => {
    const db = gateway();
    expect(await undoMatchSubstitution("", "match-1", db))
      .toEqual({ success: false, error: "Substituicao invalida." });
    expect(await undoMatchSubstitution("sub-1", "", db))
      .toEqual({ success: false, error: "Substituicao invalida." });
    expect(db.loadSelectedMatchRoundId).not.toHaveBeenCalled();
  });

  it("verifica pelada e vínculo antes da RPC, usando a primeira leitura para revalidar", async () => {
    const db = gateway();
    expect(await undoMatchSubstitution("sub-1", "match-1", db))
      .toEqual({ success: true, roundId: "round-1" });
    expect(db.loadSelectedMatchRoundId).toHaveBeenCalledExactlyOnceWith("match-1");
    expect(db.isSubstitutionInMatch).toHaveBeenCalledExactlyOnceWith("sub-1", "match-1");
    expect(db.undo).toHaveBeenCalledExactlyOnceWith("sub-1");
    expect(db.loadSelectedMatchRoundId.mock.invocationCallOrder[0])
      .toBeLessThan(db.isSubstitutionInMatch.mock.invocationCallOrder[0]);
    expect(db.isSubstitutionInMatch.mock.invocationCallOrder[0])
      .toBeLessThan(db.undo.mock.invocationCallOrder[0]);
  });

  it("não desfaz substituição de outra partida", async () => {
    const db = gateway();
    db.isSubstitutionInMatch.mockResolvedValue(false);
    expect(await undoMatchSubstitution("sub-1", "match-1", db))
      .toEqual({ success: false, error: "Substituição fora da partida selecionada." });
    expect(db.undo).not.toHaveBeenCalled();
  });

  it("não chama a RPC fora da pelada selecionada e propaga falhas", async () => {
    const db = gateway();
    db.loadSelectedMatchRoundId.mockRejectedValueOnce(new Error("Partida fora da pelada selecionada."));
    await expect(undoMatchSubstitution("sub-1", "match-1", db))
      .rejects.toThrow("Partida fora da pelada selecionada.");
    expect(db.undo).not.toHaveBeenCalled();
    db.undo.mockRejectedValueOnce(new Error("Somente a substituição mais recente"));
    await expect(undoMatchSubstitution("sub-1", "match-1", db))
      .rejects.toThrow("Somente a substituição mais recente");
  });
});
