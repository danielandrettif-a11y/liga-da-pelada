import { describe, expect, it, vi } from "vitest";
import { supabaseCallupOpeningGateway } from "./supabase-callup-opening-gateway";

function callupsClient(insertError: { code: string; message: string } | null = null) {
  const limit = vi.fn().mockResolvedValue({ data: [], error: null });
  const eq = vi.fn().mockReturnThis();
  const inFilter = vi.fn().mockReturnThis();
  const single = vi.fn().mockResolvedValue({ data: { id: "callup-1" }, error: insertError });
  const select = vi.fn().mockReturnValue({ eq, in: inFilter, limit, single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ select, insert });
  const rpc = vi.fn().mockResolvedValue({ data: "callup-1", error: insertError });
  return { from, select, eq, inFilter, limit, insert, single, rpc };
}

describe("gateway de abertura da convocação", () => {
  it("busca ocupação somente na data e na pelada, incluindo status convertida", async () => {
    const client = callupsClient();
    const gateway = supabaseCallupOpeningGateway(client as unknown as Parameters<typeof supabaseCallupOpeningGateway>[0]);
    expect(await gateway.existsOnDate("league-1", "2026-10-17")).toBe(false);
    expect(client.eq).toHaveBeenCalledWith("league_id", "league-1");
    expect(client.eq).toHaveBeenCalledWith("date", "2026-10-17");
    expect(client.inFilter).toHaveBeenCalledWith("status", ["open", "locked", "converted"]);
    expect(client.limit).toHaveBeenCalledWith(1);
  });

  it("mapeia a violação de unicidade do banco para data duplicada", async () => {
    const client = callupsClient({ code: "23505", message: "duplicate" });
    const gateway = supabaseCallupOpeningGateway(client as unknown as Parameters<typeof supabaseCallupOpeningGateway>[0]);
    expect(await gateway.insert({
      leagueId: "league-1", date: "2026-10-17", startTime: "08:00",
      stadiumId: null, stadiumName: null, stadiumMapUrl: null,
      roundType: "official", capacity: 21, playersPerTeam: 7, teamsPerRound: 3,
    })).toEqual({ status: "duplicate" });
    expect(client.rpc).toHaveBeenCalledWith("create_league_callup", expect.objectContaining({
      p_league_id: "league-1",
      p_capacity: 21,
    }));
  });

  it("cria a convocação pela RPC isolada à pelada", async () => {
    const client = callupsClient();
    const gateway = supabaseCallupOpeningGateway(client as unknown as Parameters<typeof supabaseCallupOpeningGateway>[0]);
    expect(await gateway.insert({
      leagueId: "league-1", date: "2026-10-17", startTime: "08:00",
      stadiumId: null, stadiumName: "Arena", stadiumMapUrl: null,
      roundType: "official", capacity: 21, playersPerTeam: 7, teamsPerRound: 3,
    })).toEqual({ status: "created", id: "callup-1" });
    expect(client.rpc).toHaveBeenCalledWith("create_league_callup", expect.objectContaining({
      p_stadium_name: "Arena",
      p_players_per_team: 7,
      p_teams_per_round: 3,
    }));
  });
});
