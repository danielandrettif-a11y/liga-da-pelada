import { describe, expect, it, vi } from "vitest";
import { inviteCallupGuest, inviteCallupGuestList, removeCallupEntryForAccount, type CallupGuestGateway } from "./manage-callup-guests";
import type { CallupPlayersGateway } from "./manage-callup-players";

function guestGateway(): CallupGuestGateway & {
  createGuest: ReturnType<typeof vi.fn>;
  loadCallup: ReturnType<typeof vi.fn>;
  removeCreatedEntry: ReturnType<typeof vi.fn>;
  notifyWithdrawal: ReturnType<typeof vi.fn>;
} {
  return {
    createGuest: vi.fn().mockResolvedValue({ status: "confirmed", playerId: "guest-1", error: null }),
    loadCallup: vi.fn().mockResolvedValue({ callup: { status: "open", roundId: "round-1" }, error: null }),
    removeCreatedEntry: vi.fn().mockResolvedValue(null),
    notifyWithdrawal: vi.fn().mockResolvedValue(undefined),
  };
}

function playersGateway(): CallupPlayersGateway & {
  removeAsAdmin: ReturnType<typeof vi.fn>;
  notifyWithdrawal: ReturnType<typeof vi.fn>;
} {
  return {
    addAsAdmin: vi.fn(),
    addAsMember: vi.fn(),
    removeAsAdmin: vi.fn().mockResolvedValue(null),
    notifyWithdrawal: vi.fn().mockResolvedValue(undefined),
  };
}

const creator = { callupId: "callup-1", playerId: "player-1", leagueId: "league-1", isAdmin: false };

describe("gestão de convidados na convocação", () => {
  it("valida o nome antes da criação transacional e devolve status", async () => {
    const gateway = guestGateway();
    const input = { callupId: "callup-1", name: "  Ana  ", playerProfile: "midfield" as const, isGoalkeeper: false };
    expect(await inviteCallupGuest(input, gateway)).toEqual({ success: true, isConfirmed: true, playerId: "guest-1" });
    expect(gateway.createGuest).toHaveBeenCalledWith({ ...input, name: "Ana" });
    gateway.createGuest.mockResolvedValue({ status: "waitlist", playerId: "guest-2", error: null });
    expect(await inviteCallupGuest(input, gateway)).toEqual({ success: true, isConfirmed: false, playerId: "guest-2" });
    expect(await inviteCallupGuest({ ...input, name: " A " }, gateway))
      .toEqual({ success: false, error: "Informe o nome do seu amigo (pelo menos 2 letras)." });
    expect(gateway.createGuest).toHaveBeenCalledTimes(2);
  });

  it("propaga falha da criação sem confirmar convidado", async () => {
    const gateway = guestGateway();
    gateway.createGuest.mockResolvedValue({ status: undefined, playerId: undefined, error: "lista fechada" });
    expect(await inviteCallupGuest({ callupId: "callup-1", name: "Ana", playerProfile: "midfield", isGoalkeeper: false }, gateway))
      .toEqual({ success: false, error: "lista fechada" });
  });

  it("cria a lista na ordem e resume titulares, fila e falhas", async () => {
    const gateway = guestGateway();
    gateway.createGuest
      .mockResolvedValueOnce({ status: "confirmed", playerId: "guest-1", error: null })
      .mockResolvedValueOnce({ status: "waitlist", playerId: "guest-2", error: null })
      .mockResolvedValueOnce({ status: undefined, playerId: undefined, error: "lista cheia" });

    expect(await inviteCallupGuestList({
      callupId: "callup-1",
      playerProfile: "offensive",
      guests: [
        { name: "Ana", isGoalkeeper: false },
        { name: "Bia", isGoalkeeper: true },
        { name: "Caio", isGoalkeeper: false },
      ],
    }, gateway)).toEqual({
      success: true,
      created: 2,
      confirmed: 1,
      waitlisted: 1,
      failed: [{ name: "Caio", error: "lista cheia" }],
      error: undefined,
    });
    expect(gateway.createGuest.mock.calls.map((call) => call[0].name)).toEqual(["Ana", "Bia", "Caio"]);
    expect(gateway.createGuest.mock.calls[1][0].isGoalkeeper).toBe(true);
  });

  it("limita o tamanho da importação em lote", async () => {
    const gateway = guestGateway();
    const guests = Array.from({ length: 41 }, (_, index) => ({ name: `Convidado ${index}`, isGoalkeeper: false }));
    const result = await inviteCallupGuestList({ callupId: "callup-1", playerProfile: "midfield", guests }, gateway);
    expect(result.success).toBe(false);
    expect(result.error).toContain("no máximo 40");
    expect(gateway.createGuest).not.toHaveBeenCalled();
  });

  it("usa a RPC administrativa para remover inclusive após sorteio", async () => {
    const gateway = guestGateway();
    const players = playersGateway();
    gateway.loadCallup.mockResolvedValue({ callup: { status: "converted", roundId: "round-1" }, error: null });
    expect(await removeCallupEntryForAccount({ ...creator, isAdmin: true }, gateway, players))
      .toEqual({ success: true, revalidateRoundId: "round-1" });
    expect(players.removeAsAdmin).toHaveBeenCalledWith("callup-1", "player-1");
    expect(players.notifyWithdrawal).toHaveBeenCalledWith("callup-1", "player-1");
    expect(gateway.removeCreatedEntry).not.toHaveBeenCalled();
  });

  it("propaga bloqueios de estado e autoria decididos no banco", async () => {
    const gateway = guestGateway();
    const players = playersGateway();
    gateway.removeCreatedEntry.mockResolvedValueOnce("Depois do sorteio, somente o administrador pode retirar outro jogador.")
      .mockResolvedValueOnce("Você só pode remover convidados cadastrados por você.");
    expect(await removeCallupEntryForAccount(creator, gateway, players))
      .toEqual({ success: false, error: "Depois do sorteio, somente o administrador pode retirar outro jogador." });
    expect(await removeCallupEntryForAccount(creator, gateway, players))
      .toEqual({ success: false, error: "Você só pode remover convidados cadastrados por você." });
    expect(gateway.notifyWithdrawal).not.toHaveBeenCalled();
  });

  it("avisa o Cartola apenas após retirada atômica", async () => {
    const gateway = guestGateway();
    const players = playersGateway();
    expect(await removeCallupEntryForAccount(creator, gateway, players))
      .toEqual({ success: true, revalidateRoundId: null });
    expect(gateway.loadCallup).toHaveBeenCalledWith("callup-1", "league-1");
    expect(gateway.notifyWithdrawal).toHaveBeenCalledWith("callup-1", "player-1");
    expect(gateway.removeCreatedEntry.mock.invocationCallOrder[0]).toBeLessThan(gateway.notifyWithdrawal.mock.invocationCallOrder[0]);
  });

  it("não avisa se a retirada falhar", async () => {
    const gateway = guestGateway();
    const players = playersGateway();
    gateway.removeCreatedEntry.mockResolvedValue("RLS negou a exclusão");
    expect(await removeCallupEntryForAccount(creator, gateway, players))
      .toEqual({ success: false, error: "RLS negou a exclusão" });
    expect(gateway.notifyWithdrawal).not.toHaveBeenCalled();
  });
});
