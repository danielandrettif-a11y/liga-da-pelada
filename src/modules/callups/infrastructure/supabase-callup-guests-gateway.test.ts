import { describe, expect, it, vi } from "vitest";
import { notifyCartolaLineupsAboutWithdrawal } from "@/lib/cartola-withdrawal-notifications";
import { supabaseCallupGuestsGateway } from "./supabase-callup-guests-gateway";

vi.mock("@/lib/cartola-withdrawal-notifications", () => ({
  notifyCartolaLineupsAboutWithdrawal: vi.fn().mockResolvedValue({ sent: 0 }),
}));

function client() {
  const callupQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { status: "open", round_id: "round-1" }, error: null }),
  };
  const entryQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: "entry-1", joined_by: "user-1", player_id: "player-1", player: { created_by_user_id: "user-2" } },
      error: null,
    }),
    delete: vi.fn().mockReturnThis(),
    then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
  };
  const from = vi.fn((table: string) => table === "callups" ? callupQuery : entryQuery);
  const rpc = vi.fn(async (name: string) => ({
    data: name === "create_callup_guest" ? [{ status: "waitlist", player_id: "guest-1" }] : null,
    error: null,
  }));
  return { from, rpc, callupQuery, entryQuery };
}

describe("gateway de convidados da convocação", () => {
  it("usa o RPC transacional de criação e mapeia a entrada retornada", async () => {
    const db = client();
    const gateway = supabaseCallupGuestsGateway(db as unknown as Parameters<typeof supabaseCallupGuestsGateway>[0]);
    expect(await gateway.createGuest({ callupId: "callup-1", name: "Ana", playerProfile: "midfield", isGoalkeeper: true }))
      .toEqual({ status: "waitlist", playerId: "guest-1", error: null });
    expect(db.rpc).toHaveBeenCalledWith("create_callup_guest", {
      p_callup_id: "callup-1", p_name: "Ana", p_player_profile: "midfield", p_is_goalkeeper: true,
    });
  });

  it("lê convocação com filtro de pelada e autoria da entrada", async () => {
    const db = client();
    const gateway = supabaseCallupGuestsGateway(db as unknown as Parameters<typeof supabaseCallupGuestsGateway>[0]);
    expect(await gateway.loadCallup("callup-1", "league-1"))
      .toEqual({ callup: { status: "open", roundId: "round-1" }, error: null });
    expect(await gateway.loadEntry("callup-1", "player-1"))
      .toEqual({ entry: { joinedBy: "user-1", createdByUserId: "user-2" }, error: null });
    expect(db.callupQuery.eq).toHaveBeenCalledWith("league_id", "league-1");
    expect(db.entryQuery.eq).toHaveBeenCalledWith("callup_id", "callup-1");
    expect(db.entryQuery.eq).toHaveBeenCalledWith("player_id", "player-1");
  });

  it("remove somente a entrada indicada e preserva aviso e normalização", async () => {
    const db = client();
    const gateway = supabaseCallupGuestsGateway(db as unknown as Parameters<typeof supabaseCallupGuestsGateway>[0]);
    expect(await gateway.deleteEntry("callup-1", "player-1")).toBeNull();
    await gateway.notifyWithdrawal("callup-1", "player-1");
    await gateway.normalizePositions("callup-1");
    expect(db.entryQuery.delete).toHaveBeenCalled();
    expect(db.entryQuery.eq).toHaveBeenCalledWith("callup_id", "callup-1");
    expect(db.entryQuery.eq).toHaveBeenCalledWith("player_id", "player-1");
    expect(notifyCartolaLineupsAboutWithdrawal).toHaveBeenCalledWith(db, "callup-1", "player-1");
    expect(db.rpc).toHaveBeenCalledWith("normalize_callup_positions", { p_callup_id: "callup-1" });
  });
});
