import { describe, expect, it, vi } from "vitest";
import { supabaseCallupEditingGateway } from "./supabase-callup-editing-gateway";
import type { EditedCallupRecord } from "../application/edit-callup";

const record: EditedCallupRecord = {
  callupId: "callup-1", leagueId: "league-1", date: "2026-10-17", startTime: "08:00",
  stadiumId: null, stadiumName: "Campo BQ", stadiumMapUrl: null, roundType: "official",
};

function client() {
  const query = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: { round_id: "round-1" }, error: null }),
    single: vi.fn().mockResolvedValue({ data: { stadium_name: "Campo BQ", stadium_map_url: null }, error: null }),
    then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
  };
  const from = vi.fn().mockReturnValue(query);
  return { from, query };
}

describe("gateway de edição da convocação", () => {
  it("procura conflito por pelada, data e status, excluindo a convocação atual", async () => {
    const db = client();
    const gateway = supabaseCallupEditingGateway(db as unknown as Parameters<typeof supabaseCallupEditingGateway>[0]);
    expect(await gateway.existsOnDate("league-1", "2026-10-17", "callup-1")).toBe(false);
    expect(db.query.eq).toHaveBeenCalledWith("league_id", "league-1");
    expect(db.query.eq).toHaveBeenCalledWith("date", "2026-10-17");
    expect(db.query.neq).toHaveBeenCalledWith("id", "callup-1");
    expect(db.query.in).toHaveBeenCalledWith("status", ["open", "locked", "converted"]);
  });

  it("filtra gravação e sincronização da rodada pela pelada", async () => {
    const db = client();
    const gateway = supabaseCallupEditingGateway(db as unknown as Parameters<typeof supabaseCallupEditingGateway>[0]);
    expect(await gateway.updateCallup(record)).toBeNull();
    expect(await gateway.loadLinkedRoundId("callup-1", "league-1")).toBe("round-1");
    await gateway.syncDraftRound("round-1", record);
    expect(db.from).toHaveBeenCalledWith("callups");
    expect(db.from).toHaveBeenCalledWith("rounds");
    expect(db.query.eq).toHaveBeenCalledWith("league_id", "league-1");
    expect(db.query.eq).toHaveBeenCalledWith("status", "draft");
    expect(db.query.update).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-10-17", round_type: "official" }));
  });
});
