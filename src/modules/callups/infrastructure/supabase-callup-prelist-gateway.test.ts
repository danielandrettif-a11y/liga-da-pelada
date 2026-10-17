import { describe, expect, it, vi } from "vitest";
import { supabaseCallupPrelistGateway } from "./supabase-callup-prelist-gateway";

describe("gateway Supabase da pré-lista", () => {
  it("consulta a convocação apenas na pelada selecionada", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnValue({ eq, maybeSingle });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from, rpc: vi.fn() };
    const gateway = supabaseCallupPrelistGateway(client as unknown as Parameters<typeof supabaseCallupPrelistGateway>[0]);
    expect(await gateway.loadCallup("callup-1", "league-1"))
      .toEqual({ callup: null, error: null });
    expect(from).toHaveBeenCalledWith("callups");
    expect(eq).toHaveBeenCalledWith("id", "callup-1");
    expect(eq).toHaveBeenCalledWith("league_id", "league-1");
  });

  it("salva a pré-lista pelo RPC existente com escopo e confirmados", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "round-1", error: null });
    const gateway = supabaseCallupPrelistGateway({ rpc } as unknown as Parameters<typeof supabaseCallupPrelistGateway>[0]);
    const callup = {
      id: "callup-1", date: "2026-10-17", startTime: null,
      stadiumId: "stadium-1", stadiumName: "Campo BQ", stadiumMapUrl: null,
      roundType: "official", status: "open", roundId: null, entries: [],
    };
    expect(await gateway.save({ leagueId: "league-1", callup, confirmedPlayerIds: ["player-1"] }))
      .toEqual({ roundId: "round-1", error: null });
    expect(rpc).toHaveBeenCalledWith("save_round_prelist", {
      p_league_id: "league-1", p_round_id: null, p_date: "2026-10-17",
      p_start_time: "08:00", p_round_type: "official", p_player_ids: ["player-1"],
      p_callup_id: "callup-1", p_stadium_id: "stadium-1",
      p_stadium_name: "Campo BQ", p_stadium_map_url: null,
    });
  });
});
