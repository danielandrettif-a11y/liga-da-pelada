import { describe, expect, it, vi } from "vitest";
import { joinSelectedCallup, leaveSelectedCallup, type CallupParticipationGateway } from "./participate-in-callup";

function gateway(): CallupParticipationGateway & {
  ensurePlayerAccount: ReturnType<typeof vi.fn>;
  join: ReturnType<typeof vi.fn>;
  loadRoundId: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  loadPlayerId: ReturnType<typeof vi.fn>;
  notifyWithdrawal: ReturnType<typeof vi.fn>;
} {
  return {
    ensurePlayerAccount: vi.fn().mockResolvedValue(null),
    join: vi.fn().mockResolvedValue({ status: "confirmed", error: null }),
    loadRoundId: vi.fn().mockResolvedValue("round-1"),
    leave: vi.fn().mockResolvedValue(null),
    loadPlayerId: vi.fn().mockResolvedValue("player-1"),
    notifyWithdrawal: vi.fn().mockResolvedValue(undefined),
  };
}

describe("participação na convocação", () => {
  it("garante o perfil antes de entrar e devolve a posição confirmada", async () => {
    const store = gateway();
    expect(await joinSelectedCallup("callup-1", store)).toEqual({ success: true, status: "confirmed" });
    expect(store.join).toHaveBeenCalledWith("callup-1");
    expect(store.ensurePlayerAccount.mock.invocationCallOrder[0]).toBeLessThan(store.join.mock.invocationCallOrder[0]);
  });

  it("não entra se a conta do jogador não puder ser garantida", async () => {
    const store = gateway();
    store.ensurePlayerAccount.mockResolvedValue("perfil indisponível");
    expect(await joinSelectedCallup("callup-1", store))
      .toEqual({ success: false, error: "perfil indisponível" });
    expect(store.join).not.toHaveBeenCalled();
  });

  it("propaga erro da RPC de entrada sem inventar status", async () => {
    const store = gateway();
    store.join.mockResolvedValue({ status: undefined, error: "lista fechada" });
    expect(await joinSelectedCallup("callup-1", store)).toEqual({ success: false, error: "lista fechada" });
  });

  it("sai da lista e avisa escalações do Cartola após a RPC", async () => {
    const store = gateway();
    expect(await leaveSelectedCallup("callup-1", "league-1", "user-1", store))
      .toEqual({ success: true, roundId: "round-1" });
    expect(store.loadRoundId).toHaveBeenCalledWith("callup-1", "league-1");
    expect(store.loadPlayerId).toHaveBeenCalledWith("user-1");
    expect(store.notifyWithdrawal).toHaveBeenCalledWith("callup-1", "player-1");
    expect(store.leave.mock.invocationCallOrder[0]).toBeLessThan(store.notifyWithdrawal.mock.invocationCallOrder[0]);
  });

  it("não avisa o Cartola se a saída falhar ou a conta não tiver jogador", async () => {
    const store = gateway();
    store.leave.mockResolvedValue("não foi possível sair");
    expect(await leaveSelectedCallup("callup-1", "league-1", "user-1", store))
      .toEqual({ success: false, error: "não foi possível sair" });
    expect(store.loadPlayerId).not.toHaveBeenCalled();
    expect(store.notifyWithdrawal).not.toHaveBeenCalled();

    store.leave.mockResolvedValue(null);
    store.loadPlayerId.mockResolvedValue(null);
    expect(await leaveSelectedCallup("callup-1", "league-1", "user-1", store))
      .toEqual({ success: true, roundId: "round-1" });
    expect(store.notifyWithdrawal).not.toHaveBeenCalled();
  });
});
