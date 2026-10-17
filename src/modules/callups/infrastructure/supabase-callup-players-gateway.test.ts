import { describe, expect, it, vi } from "vitest";
import { notifyCartolaLineupsAboutWithdrawal } from "@/lib/cartola-withdrawal-notifications";
import { supabaseCallupPlayersGateway } from "./supabase-callup-players-gateway";

vi.mock("@/lib/cartola-withdrawal-notifications", () => ({
  notifyCartolaLineupsAboutWithdrawal: vi.fn().mockResolvedValue({ sent: 0 }),
}));

function client() {
  const rpc = vi.fn(async (name: string) => ({
    data: name === "admin_add_callup_player" ? { status: "confirmed" } : null,
    error: null,
  }));
  return { rpc };
}

describe("gateway de outros jogadores na convocação", () => {
  it("chama os RPCs específicos com os mesmos parâmetros", async () => {
    const db = client();
    const gateway = supabaseCallupPlayersGateway(db as unknown as Parameters<typeof supabaseCallupPlayersGateway>[0]);
    expect(await gateway.addAsAdmin("callup-1", "player-1"))
      .toEqual({ status: "confirmed", error: null });
    expect(await gateway.addAsMember("callup-1", "player-1")).toBeNull();
    expect(await gateway.removeAsAdmin("callup-1", "player-1")).toBeNull();
    expect(db.rpc).toHaveBeenCalledWith("admin_add_callup_player", {
      p_callup_id: "callup-1", p_player_id: "player-1",
    });
    expect(db.rpc).toHaveBeenCalledWith("add_player_to_callup", {
      p_callup_id: "callup-1", p_player_id: "player-1", p_admin_only: false,
    });
    expect(db.rpc).toHaveBeenCalledWith("admin_remove_callup_player", {
      p_callup_id: "callup-1", p_player_id: "player-1",
    });
  });

  it("mantém o aviso de desistência para escalações do Cartola", async () => {
    const db = client();
    const gateway = supabaseCallupPlayersGateway(db as unknown as Parameters<typeof supabaseCallupPlayersGateway>[0]);
    await gateway.notifyWithdrawal("callup-1", "player-1");
    expect(notifyCartolaLineupsAboutWithdrawal).toHaveBeenCalledWith(db, "callup-1", "player-1");
  });
});
