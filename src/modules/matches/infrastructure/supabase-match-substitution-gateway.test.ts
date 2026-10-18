import { describe, expect, it, vi } from "vitest";
import { getMatchState } from "./match-scope";
import { supabaseMatchSubstitutionGateway } from "./supabase-match-substitution-gateway";

vi.mock("./match-scope", () => ({ getMatchState: vi.fn().mockResolvedValue({ round_id: "round-1" }) }));

function client() {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { round: [{ formation_mode: "automatic", round_players: [
        { player_id: "player-2", attendance_status: "present" },
      ] }] },
      error: null,
    }),
  };
  const from = vi.fn(() => query);
  const rpc = vi.fn().mockResolvedValue({ data: "substitution-1", error: null });
  return { from, rpc, query };
}

const input = {
  match_id: "match-1", team_id: "team-1", player_out_id: "player-1",
  player_in_id: "player-2", reason: "injury" as const, mark_injured: true,
};

describe("gateway de substituição", () => {
  it("lê a partida uma vez no escopo selecionado e filtra o substituto", async () => {
    const db = client();
    const gateway = supabaseMatchSubstitutionGateway(db as unknown as Parameters<typeof supabaseMatchSubstitutionGateway>[0]);
    expect(await gateway.loadSelectedMatchRoundId("match-1")).toBe("round-1");
    expect(getMatchState).toHaveBeenCalledWith(db, "match-1");
    expect(await gateway.loadIncomingContext("match-1", "player-2")).toEqual({
      found: true, formationMode: "automatic", attendanceStatus: "present",
    });
    expect(db.query.eq).toHaveBeenCalledWith("id", "match-1");
    expect(db.query.eq).toHaveBeenCalledWith("round.round_players.player_id", "player-2");
  });

  it("mapeia consulta sem substituto e preserva parâmetros da RPC", async () => {
    const db = client();
    db.query.single.mockResolvedValueOnce({ data: null, error: { message: "sem jogador" } });
    const gateway = supabaseMatchSubstitutionGateway(db as unknown as Parameters<typeof supabaseMatchSubstitutionGateway>[0]);
    expect(await gateway.loadIncomingContext("match-1", "player-2")).toEqual({
      found: false, formationMode: null, attendanceStatus: null,
    });
    expect(await gateway.substitute(input)).toBe("substitution-1");
    expect(db.rpc).toHaveBeenCalledWith("substitute_match_player", {
      p_match_id: "match-1", p_team_id: "team-1", p_player_out_id: "player-1",
      p_player_in_id: "player-2", p_reason: "injury", p_mark_injured: true,
    });
    await gateway.substitute({ ...input, player_in_id: undefined, mark_injured: undefined });
    expect(db.rpc).toHaveBeenLastCalledWith("substitute_match_player", {
      p_match_id: "match-1", p_team_id: "team-1", p_player_out_id: "player-1",
      p_player_in_id: null, p_reason: "injury", p_mark_injured: false,
    });
  });

  it("propaga falha da RPC", async () => {
    const db = client();
    db.rpc.mockResolvedValue({ data: null, error: { message: "jogador indisponível" } });
    const gateway = supabaseMatchSubstitutionGateway(db as unknown as Parameters<typeof supabaseMatchSubstitutionGateway>[0]);
    await expect(gateway.substitute(input)).rejects.toThrow("jogador indisponível");
  });
});
