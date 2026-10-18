import { describe, expect, it, vi } from "vitest";
import { notifyCallupWithdrawal } from "@/lib/cartola-withdrawal-notifications";
import { supabaseCallupParticipationGateway } from "./supabase-callup-participation-gateway";

vi.mock("@/lib/cartola-withdrawal-notifications", () => ({
  notifyCallupWithdrawal: vi.fn().mockResolvedValue({ admins: { sent: 0 }, cartola: { sent: 0 } }),
}));

function client() {
  const callupQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { round_id: "round-1" }, error: null }),
  };
  const profileQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { player_id: "player-1" }, error: null }),
  };
  const from = vi.fn((table: string) => table === "callups" ? callupQuery : profileQuery);
  const rpc = vi.fn(async (name: string) => ({
    data: name === "join_callup" ? { status: "waitlist" } : null,
    error: null,
  }));
  return { from, rpc, callupQuery, profileQuery };
}

describe("gateway de participação na convocação", () => {
  it("usa as RPCs autoritativas para perfil, entrada e saída", async () => {
    const db = client();
    const gateway = supabaseCallupParticipationGateway(db as unknown as Parameters<typeof supabaseCallupParticipationGateway>[0]);
    expect(await gateway.ensurePlayerAccount()).toBeNull();
    expect(await gateway.join("callup-1")).toEqual({ status: "waitlist", error: null });
    expect(await gateway.leave("callup-1")).toBeNull();
    expect(db.rpc).toHaveBeenCalledWith("ensure_my_player_account");
    expect(db.rpc).toHaveBeenCalledWith("join_callup", { p_callup_id: "callup-1" });
    expect(db.rpc).toHaveBeenCalledWith("leave_callup", { p_callup_id: "callup-1" });
  });

  it("busca a rodada na pelada selecionada e o jogador da conta autenticada", async () => {
    const db = client();
    const gateway = supabaseCallupParticipationGateway(db as unknown as Parameters<typeof supabaseCallupParticipationGateway>[0]);
    expect(await gateway.loadRoundId("callup-1", "league-1")).toBe("round-1");
    expect(await gateway.loadPlayerId("user-1")).toBe("player-1");
    expect(db.callupQuery.eq).toHaveBeenCalledWith("id", "callup-1");
    expect(db.callupQuery.eq).toHaveBeenCalledWith("league_id", "league-1");
    expect(db.profileQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("encaminha a desistência aos avisos de ADM e Cartola", async () => {
    const db = client();
    const gateway = supabaseCallupParticipationGateway(db as unknown as Parameters<typeof supabaseCallupParticipationGateway>[0]);
    await gateway.notifyWithdrawal("callup-1", "player-1");
    expect(notifyCallupWithdrawal).toHaveBeenCalledWith(
      db, "callup-1", "player-1",
    );
  });
});
