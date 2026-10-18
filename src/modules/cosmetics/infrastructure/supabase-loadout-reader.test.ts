import { describe, expect, it, vi } from "vitest";
import { readAccountCosmeticLoadout, readPlayerCosmeticLoadout, readPlayersCosmeticLoadouts } from "./supabase-loadout-reader";

function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  return {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
}

function setup({ currentError = false, profiles = [{ user_id: "user-a", player_id: "player-a" }] } = {}) {
  const current = query(currentError ? null : [{ user_id: "user-a", pitch: { asset_key: "pitch-a" } }],
    currentError ? { message: "coluna nova ausente" } : null);
  const legacy = query([{ user_id: "user-a", frame: { asset_key: "frame-a" } }]);
  current.maybeSingle.mockResolvedValue({
    data: currentError ? null : { user_id: "user-a", pitch: { asset_key: "pitch-a" } },
    error: currentError ? { message: "coluna nova ausente" } : null,
  });
  legacy.maybeSingle.mockResolvedValue({ data: { user_id: "user-a", frame: { asset_key: "frame-a" } }, error: null });
  const profileQuery = query(profiles);
  const profileSingle = query(profiles[0] || null);
  const loadouts = { select: vi.fn((selection: string) => selection.includes("pitch:pitch_cosmetic_id") ? current : legacy) };
  const accounts = { select: vi.fn(() => ({
    ...profileQuery,
    maybeSingle: profileSingle.maybeSingle,
  })) };
  const db = { from: vi.fn((table: string) => table === "account_cosmetic_loadouts" ? loadouts : accounts) };
  const client = db as unknown as Parameters<typeof readAccountCosmeticLoadout>[0];
  return { client, db, loadouts, accounts, current, legacy, profileQuery, profileSingle };
}

describe("leitura de cosméticos equipados no Supabase", () => {
  it("consulta loadout de uma conta sem abrir a lista inteira", async () => {
    const { client, current, legacy, loadouts } = setup();
    expect(await readAccountCosmeticLoadout(client, "user-a"))
      .toEqual({ user_id: "user-a", pitch: { asset_key: "pitch-a" } });
    expect(current.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(current.maybeSingle).toHaveBeenCalledOnce();
    expect(loadouts.select).toHaveBeenCalledOnce();
    expect(legacy.maybeSingle).not.toHaveBeenCalled();
  });

  it("recupera os seis slots antigos quando a seleção dos slots novos falha", async () => {
    const { client, current, legacy, loadouts } = setup({ currentError: true });
    expect(await readAccountCosmeticLoadout(client, "user-a"))
      .toEqual({ user_id: "user-a", frame: { asset_key: "frame-a" } });
    expect(current.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(legacy.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(loadouts.select).toHaveBeenCalledTimes(2);
  });

  it("resolve o jogador para a conta antes de carregar o loadout", async () => {
    const { client, profileQuery, current } = setup();
    await readPlayerCosmeticLoadout(client, "player-a");
    expect(profileQuery.eq).toHaveBeenCalledWith("player_id", "player-a");
    expect(current.eq).toHaveBeenCalledWith("user_id", "user-a");
  });

  it("não consulta loadout se o jogador não tem conta vinculada", async () => {
    const { client, db } = setup({ profiles: [] });
    expect(await readPlayerCosmeticLoadout(client, "player-sem-conta")).toBeNull();
    expect(db.from).not.toHaveBeenCalledWith("account_cosmetic_loadouts");
  });

  it("deduplica os IDs solicitados e carrega só as contas encontradas", async () => {
    const { client, profileQuery, current } = setup();
    const result = await readPlayersCosmeticLoadouts(client, ["player-a", "player-a"]);
    expect(profileQuery.in).toHaveBeenCalledWith("player_id", ["player-a"]);
    expect(current.in).toHaveBeenCalledWith("user_id", ["user-a"]);
    expect(result.profiles).toEqual([{ user_id: "user-a", player_id: "player-a" }]);
  });

  it("não varre os loadouts se nenhum perfil foi encontrado", async () => {
    const { client, db } = setup({ profiles: [] });
    expect(await readPlayersCosmeticLoadouts(client, ["player-inexistente"]))
      .toEqual({ profiles: [], loadouts: [] });
    expect(db.from).not.toHaveBeenCalledWith("account_cosmetic_loadouts");
  });

  it("não consulta o banco para uma lista vazia", async () => {
    const { client, db } = setup();
    expect(await readPlayersCosmeticLoadouts(client, []))
      .toEqual({ profiles: [], loadouts: [] });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("usa as relações legadas também na leitura de vários jogadores", async () => {
    const { client, current, legacy } = setup({ currentError: true });
    const result = await readPlayersCosmeticLoadouts(client, ["player-a"]);
    expect(current.in).toHaveBeenCalledWith("user_id", ["user-a"]);
    expect(legacy.in).toHaveBeenCalledWith("user_id", ["user-a"]);
    expect(result.loadouts).toEqual([{ user_id: "user-a", frame: { asset_key: "frame-a" } }]);
  });

  it("mantém a leitura pública de todos os perfis quando não há filtro", async () => {
    const { client, profileQuery, current } = setup();
    const result = await readPlayersCosmeticLoadouts(client);
    expect(profileQuery.not).toHaveBeenCalledWith("player_id", "is", null);
    expect(current.in).not.toHaveBeenCalled();
    expect(result.profiles).toHaveLength(1);
    expect(result.loadouts).toHaveLength(1);
  });
});
