import { describe, expect, it, vi } from "vitest";
import { getSelectedLeague } from "@/lib/league-context";
import { getMatchState } from "./match-scope";

vi.mock("@/lib/league-context", () => ({ getSelectedLeague: vi.fn().mockResolvedValue({ id: "league-1" }) }));

function client(round: { league_id: string } | null = { league_id: "league-1" }) {
  const matchQuery = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: "match-1", round_id: "round-1" }, error: null }),
  };
  const roundQuery = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: round, error: null }),
  };
  const from = vi.fn((table: string) => table === "matches" ? matchQuery : roundQuery);
  return { from, matchQuery, roundQuery };
}

describe("escopo da partida", () => {
  it("aceita a partida apenas quando a rodada pertence à pelada selecionada", async () => {
    const db = client();
    expect(await getMatchState(db as unknown as Parameters<typeof getMatchState>[0], "match-1"))
      .toMatchObject({ id: "match-1", round_id: "round-1" });
    expect(db.roundQuery.eq).toHaveBeenCalledWith("id", "round-1");
    expect(db.roundQuery.eq).toHaveBeenCalledWith("league_id", "league-1");
  });

  it("rejeita uma partida de outra pelada", async () => {
    const db = client(null);
    await expect(getMatchState(db as unknown as Parameters<typeof getMatchState>[0], "match-1"))
      .rejects.toThrow("Partida fora da pelada selecionada.");
  });

  it("exige uma pelada selecionada antes de consultar a rodada", async () => {
    vi.mocked(getSelectedLeague).mockResolvedValueOnce(null);
    const db = client();
    await expect(getMatchState(db as unknown as Parameters<typeof getMatchState>[0], "match-1"))
      .rejects.toThrow("Selecione uma pelada no lobby.");
    expect(db.roundQuery.maybeSingle).not.toHaveBeenCalled();
  });
});
