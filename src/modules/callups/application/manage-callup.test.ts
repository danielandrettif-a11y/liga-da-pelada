import { describe, expect, it, vi } from "vitest";
import {
  changeCallupVisibility,
  closeSelectedCallup,
  lockSelectedCallup,
  type CallupManagementGateway,
} from "./manage-callup";

function gateway(): CallupManagementGateway & {
  close: ReturnType<typeof vi.fn>;
  setVisibility: ReturnType<typeof vi.fn>;
  loadCapacity: ReturnType<typeof vi.fn>;
  countConfirmed: ReturnType<typeof vi.fn>;
  lock: ReturnType<typeof vi.fn>;
} {
  return {
    close: vi.fn().mockResolvedValue(null),
    setVisibility: vi.fn().mockResolvedValue(null),
    loadCapacity: vi.fn().mockResolvedValue({ capacity: 21, error: null }),
    countConfirmed: vi.fn().mockResolvedValue({ count: 21, error: null }),
    lock: vi.fn().mockResolvedValue(null),
  };
}

describe("gerenciamento da convocação", () => {
  it("fecha somente a convocação da pelada informada e propaga falha", async () => {
    const store = gateway();
    expect(await closeSelectedCallup("callup-1", "league-1", store)).toEqual({ success: true });
    expect(store.close).toHaveBeenCalledWith("callup-1", "league-1");
    store.close.mockResolvedValue("sem permissão");
    expect(await closeSelectedCallup("callup-1", "league-1", store))
      .toEqual({ success: false, error: "sem permissão" });
  });

  it("altera visibilidade na pelada selecionada", async () => {
    const store = gateway();
    expect(await changeCallupVisibility("callup-1", "league-1", false, store)).toEqual({ success: true });
    expect(store.setVisibility).toHaveBeenCalledWith("callup-1", "league-1", false);
  });

  it("não bloqueia a convocação sem lotação completa", async () => {
    const store = gateway();
    store.countConfirmed.mockResolvedValue({ count: 20, error: null });
    expect(await lockSelectedCallup("callup-1", "league-1", store))
      .toEqual({ success: false, error: "A lista precisa ter 21 confirmados para montar a rodada." });
    expect(store.lock).not.toHaveBeenCalled();
  });

  it("mantém erros de leitura sem tentar bloquear", async () => {
    const store = gateway();
    store.loadCapacity.mockResolvedValue({ capacity: null, error: "sem convocação" });
    expect(await lockSelectedCallup("callup-1", "league-1", store))
      .toEqual({ success: false, error: "sem convocação" });
    store.loadCapacity.mockResolvedValue({ capacity: 21, error: null });
    store.countConfirmed.mockResolvedValue({ count: 0, error: "erro na lista" });
    expect(await lockSelectedCallup("callup-1", "league-1", store))
      .toEqual({ success: false, error: "erro na lista" });
    expect(store.lock).not.toHaveBeenCalled();
  });

  it("bloqueia a lista completa e propaga erro de gravação", async () => {
    const store = gateway();
    expect(await lockSelectedCallup("callup-1", "league-1", store)).toEqual({ success: true });
    expect(store.loadCapacity).toHaveBeenCalledWith("callup-1", "league-1");
    expect(store.countConfirmed).toHaveBeenCalledWith("callup-1");
    expect(store.lock).toHaveBeenCalledWith("callup-1", "league-1");
    store.lock.mockResolvedValue("erro ao bloquear");
    expect(await lockSelectedCallup("callup-1", "league-1", store))
      .toEqual({ success: false, error: "erro ao bloquear" });
  });
});
