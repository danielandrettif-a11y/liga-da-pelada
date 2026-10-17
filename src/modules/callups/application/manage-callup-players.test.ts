import { describe, expect, it, vi } from "vitest";
import {
  addOtherCallupPlayer,
  removeOtherCallupPlayerAsAdmin,
  type CallupPlayersGateway,
} from "./manage-callup-players";

function gateway(): CallupPlayersGateway & {
  addAsAdmin: ReturnType<typeof vi.fn>;
  addAsMember: ReturnType<typeof vi.fn>;
  removeAsAdmin: ReturnType<typeof vi.fn>;
  notifyWithdrawal: ReturnType<typeof vi.fn>;
} {
  return {
    addAsAdmin: vi.fn().mockResolvedValue({ status: "confirmed", error: null }),
    addAsMember: vi.fn().mockResolvedValue(null),
    removeAsAdmin: vi.fn().mockResolvedValue(null),
    notifyWithdrawal: vi.fn().mockResolvedValue(undefined),
  };
}

describe("outros jogadores na convocação", () => {
  it("devolve a posição confirmada ou de espera ao adicionar como ADM", async () => {
    const store = gateway();
    expect(await addOtherCallupPlayer("callup-1", "player-1", "admin", store))
      .toEqual({ success: true, status: "confirmed" });
    store.addAsAdmin.mockResolvedValue({ status: "waitlist", error: null });
    expect(await addOtherCallupPlayer("callup-1", "player-2", "admin", store))
      .toEqual({ success: true, status: "waitlist" });
    expect(store.addAsMember).not.toHaveBeenCalled();
  });

  it("mantém a via colaborativa sem privilégio administrativo", async () => {
    const store = gateway();
    expect(await addOtherCallupPlayer("callup-1", "player-1", "member", store))
      .toEqual({ success: true });
    expect(store.addAsMember).toHaveBeenCalledWith("callup-1", "player-1");
    expect(store.addAsAdmin).not.toHaveBeenCalled();
    store.addAsMember.mockResolvedValue("jogador inelegível");
    expect(await addOtherCallupPlayer("callup-1", "player-1", "member", store))
      .toEqual({ success: false, error: "jogador inelegível" });
  });

  it("não avisa o Cartola quando a remoção administrativa falha", async () => {
    const store = gateway();
    store.removeAsAdmin.mockResolvedValue("lista encerrada");
    expect(await removeOtherCallupPlayerAsAdmin("callup-1", "player-1", store))
      .toEqual({ success: false, error: "lista encerrada" });
    expect(store.notifyWithdrawal).not.toHaveBeenCalled();
  });

  it("avisa escalações afetadas somente depois da remoção administrativa", async () => {
    const store = gateway();
    expect(await removeOtherCallupPlayerAsAdmin("callup-1", "player-1", store))
      .toEqual({ success: true });
    expect(store.removeAsAdmin).toHaveBeenCalledWith("callup-1", "player-1");
    expect(store.notifyWithdrawal).toHaveBeenCalledWith("callup-1", "player-1");
    expect(store.removeAsAdmin.mock.invocationCallOrder[0]).toBeLessThan(store.notifyWithdrawal.mock.invocationCallOrder[0]);
  });
});
