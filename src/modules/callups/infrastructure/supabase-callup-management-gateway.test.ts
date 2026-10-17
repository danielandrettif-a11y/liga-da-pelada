import { describe, expect, it, vi } from "vitest";
import { supabaseCallupManagementGateway } from "./supabase-callup-management-gateway";

function client() {
  const query = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { capacity: 21 }, error: null }),
    then: (resolve: (value: { data: { id: string }[]; error: null }) => void) => resolve({ data: [{ id: "entry-1" }], error: null }),
  };
  const from = vi.fn().mockReturnValue(query);
  return { from, query };
}

describe("gateway de gerenciamento da convocação", () => {
  it("fecha e altera visibilidade filtrando pela pelada", async () => {
    const db = client();
    const gateway = supabaseCallupManagementGateway(db as unknown as Parameters<typeof supabaseCallupManagementGateway>[0]);
    expect(await gateway.close("callup-1", "league-1")).toBeNull();
    expect(await gateway.setVisibility("callup-1", "league-1", false)).toBeNull();
    expect(db.query.eq).toHaveBeenCalledWith("id", "callup-1");
    expect(db.query.eq).toHaveBeenCalledWith("league_id", "league-1");
    expect(db.query.update).toHaveBeenCalledWith(expect.objectContaining({ status: "closed" }));
    expect(db.query.update).toHaveBeenCalledWith(expect.objectContaining({ is_public: false }));
  });

  it("lê capacidade na pelada e bloqueia apenas a convocação aberta", async () => {
    const db = client();
    const gateway = supabaseCallupManagementGateway(db as unknown as Parameters<typeof supabaseCallupManagementGateway>[0]);
    expect(await gateway.loadCapacity("callup-1", "league-1")).toEqual({ capacity: 21, error: null });
    expect(await gateway.countConfirmed("callup-1")).toEqual({ count: 1, error: null });
    expect(await gateway.lock("callup-1", "league-1")).toBeNull();
    expect(db.from).toHaveBeenCalledWith("callup_entries");
    expect(db.query.eq).toHaveBeenCalledWith("league_id", "league-1");
    expect(db.query.eq).toHaveBeenCalledWith("status", "confirmed");
    expect(db.query.eq).toHaveBeenCalledWith("status", "open");
  });
});
