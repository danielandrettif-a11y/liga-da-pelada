import { describe, expect, it, vi } from "vitest";
import { notifyCallupWithdrawal } from "@/lib/cartola-withdrawal-notifications";
import { supabaseCallupGuestsGateway } from "./supabase-callup-guests-gateway";

vi.mock("@/lib/cartola-withdrawal-notifications", () => ({
  notifyCallupWithdrawal: vi.fn().mockResolvedValue({ admins: { sent: 0 }, cartola: { sent: 0 } }),
}));

function client() {
  const callupQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { status: "open", round_id: "round-1" }, error: null }),
  };
  const from = vi.fn(() => callupQuery);
  const rpc = vi.fn(async (name: string) => ({
    data: name === "create_callup_guest" ? [{ status: "waitlist", player_id: "guest-1" }] : null,
    error: null,
  }));
  return { from, rpc, callupQuery };
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

  it("lê convocação com filtro de pelada", async () => {
    const db = client();
    const gateway = supabaseCallupGuestsGateway(db as unknown as Parameters<typeof supabaseCallupGuestsGateway>[0]);
    expect(await gateway.loadCallup("callup-1", "league-1"))
      .toEqual({ callup: { status: "open", roundId: "round-1" }, error: null });
    expect(db.callupQuery.eq).toHaveBeenCalledWith("league_id", "league-1");
  });

  it("usa a RPC atômica e envia aviso após sucesso", async () => {
    const db = client();
    const gateway = supabaseCallupGuestsGateway(db as unknown as Parameters<typeof supabaseCallupGuestsGateway>[0]);
    expect(await gateway.removeCreatedEntry("callup-1", "player-1")).toBeNull();
    await gateway.notifyWithdrawal("callup-1", "player-1");
    expect(db.rpc).toHaveBeenCalledWith("remove_my_added_callup_player", {
      p_callup_id: "callup-1", p_player_id: "player-1",
    });
    expect(notifyCallupWithdrawal).toHaveBeenCalledWith(db, "callup-1", "player-1");
    expect(db.from).not.toHaveBeenCalled();
  });
});
