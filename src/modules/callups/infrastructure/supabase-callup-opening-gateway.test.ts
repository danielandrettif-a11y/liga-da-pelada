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
  return { from, select, eq, inFilter, limit, insert, single };
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
    expect(client.insert).toHaveBeenCalledWith(expect.objectContaining({ league_id: "league-1", capacity: 21 }));
  });
});
