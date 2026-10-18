import { describe, expect, it, vi } from "vitest";
import { getMatchState } from "./match-scope";
import { supabaseUndoMatchSubstitutionGateway } from "./supabase-undo-match-substitution-gateway";

vi.mock("./match-scope", () => ({ getMatchState: vi.fn().mockResolvedValue({ round_id: "round-1" }) }));

function client() {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { match_id: "match-1" }, error: null }),
  };
  return {
    from: vi.fn(() => query),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    query,
  };
}

describe("gateway para desfazer substituição", () => {
  it("carrega a partida no escopo e filtra a substituição pela partida", async () => {
    const db = client();
    const gateway = supabaseUndoMatchSubstitutionGateway(
      db as unknown as Parameters<typeof supabaseUndoMatchSubstitutionGateway>[0],
    );
    expect(await gateway.loadSelectedMatchRoundId("match-1")).toBe("round-1");
    expect(getMatchState).toHaveBeenCalledWith(db, "match-1");
    expect(await gateway.isSubstitutionInMatch("sub-1", "match-1")).toBe(true);
    expect(db.from).toHaveBeenCalledWith("match_substitutions");
    expect(db.query.eq).toHaveBeenCalledWith("id", "sub-1");
    expect(db.query.eq).toHaveBeenCalledWith("match_id", "match-1");
  });

  it("trata substituição ausente como inválida e chama a RPC exata", async () => {
    const db = client();
    db.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "consulta indisponível" } });
    const gateway = supabaseUndoMatchSubstitutionGateway(
      db as unknown as Parameters<typeof supabaseUndoMatchSubstitutionGateway>[0],
    );
    expect(await gateway.isSubstitutionInMatch("sub-1", "match-1")).toBe(false);
    expect(await gateway.isSubstitutionInMatch("sub-1", "match-1")).toBe(false);
    await gateway.undo("sub-1");
    expect(db.rpc).toHaveBeenCalledWith("undo_last_match_substitution", {
      p_substitution_id: "sub-1",
    });
  });

  it("propaga o erro da RPC sem gravar resposta de sucesso", async () => {
    const db = client();
    db.rpc.mockResolvedValue({ data: null, error: { message: "Substituição não é a última" } });
    const gateway = supabaseUndoMatchSubstitutionGateway(
      db as unknown as Parameters<typeof supabaseUndoMatchSubstitutionGateway>[0],
    );
    await expect(gateway.undo("sub-1")).rejects.toThrow("Substituição não é a última");
  });
});
