import { describe, expect, it, vi } from "vitest";
import { supabaseCallupFormatGateway } from "./supabase-callup-format-gateway";

function clientStub(found: boolean) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: found ? { id: "callup-1" } : null, error: null });
  const eq = vi.fn().mockReturnThis();
  const select = vi.fn().mockReturnValue({ eq, maybeSingle });
  const from = vi.fn().mockReturnValue({ select });
  const rpc = vi.fn().mockResolvedValue({
    data: [{ fantasy_size_preserved: true, fantasy_lineup_size: 6 }], error: null,
  });
  return { from, select, eq, maybeSingle, rpc };
}

describe("gateway Supabase do formato da convocação", () => {
  it("limita a busca à convocação aberta da pelada informada", async () => {
    const client = clientStub(false);
    const gateway = supabaseCallupFormatGateway(client as unknown as Parameters<typeof supabaseCallupFormatGateway>[0]);
    expect(await gateway.findOpenCallup("callup-1", "league-1")).toBe(false);
    expect(client.from).toHaveBeenCalledWith("callups");
    expect(client.eq).toHaveBeenCalledWith("id", "callup-1");
    expect(client.eq).toHaveBeenCalledWith("league_id", "league-1");
    expect(client.eq).toHaveBeenCalledWith("status", "open");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("mantém o RPC e retorna o tamanho de escalação calculado no banco", async () => {
    const client = clientStub(true);
    const gateway = supabaseCallupFormatGateway(client as unknown as Parameters<typeof supabaseCallupFormatGateway>[0]);
    expect(await gateway.setFormat({ callupId: "callup-1", playersPerTeam: 7, teamsPerRound: 3 }))
      .toEqual({ fantasySizePreserved: true, fantasyLineupSize: 6 });
    expect(client.rpc).toHaveBeenCalledWith("set_callup_format", {
      p_callup_id: "callup-1", p_players_per_team: 7, p_teams_per_round: 3,
    });
  });
});
