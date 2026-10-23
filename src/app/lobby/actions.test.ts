import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), leagues: vi.fn(), rpc: vi.fn(), cookieGet: vi.fn(), cookieSet: vi.fn(), cookieDelete: vi.fn(),
  revalidate: vi.fn(), redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet, delete: mocks.cookieDelete }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("@/lib/league-context", () => ({
  ACTIVE_LEAGUE_COOKIE: "active_league_id", getMyLeagues: mocks.leagues,
}));

import { createLeague, createQuickLeague, requestClosedLeague } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`redirect:${url}`); });
  mocks.account.mockResolvedValue({ user: { id: "owner" }, client: { rpc: mocks.rpc } });
  mocks.leagues.mockResolvedValue([{ id: "old-league", role: "admin" }]);
  mocks.rpc.mockResolvedValue({ data: "new-league", error: null });
});

function form(name = "Pelada HG", tier = "basic", visibility = "private") {
  const data = new FormData();
  data.set("name", name); data.set("tier", tier); data.set("visibility", visibility);
  return data;
}

describe("criação de pelada", () => {
  it("permite que um jogador comum crie a própria pelada", async () => {
    mocks.leagues.mockResolvedValue([{ id: "old-league", role: "player" }]);
    await expect(createLeague(form())).rejects.toThrow("redirect:/");
    expect(mocks.rpc).toHaveBeenCalledWith("create_league_for_user", expect.any(Object));
  });

  it("exige uma conta autenticada", async () => {
    mocks.account.mockResolvedValue({ user: null, client: { rpc: mocks.rpc } });
    await expect(createLeague(form())).rejects.toThrow("redirect:/login?next=/lobby/criar");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("valida modo, visibilidade e nome antes de criar", async () => {
    await expect(createLeague(form("HG", "complete", "private"))).rejects.toThrow("error=invalid");
    await expect(createLeague(form("Pelada HG", "unknown", "open"))).rejects.toThrow("error=invalid");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("envia apenas os dados escolhidos e seleciona a nova pelada", async () => {
    await expect(createLeague(form("  Pelada   HG  ", "complete", "open")))
      .rejects.toThrow("redirect:/");
    expect(mocks.rpc).toHaveBeenCalledWith("create_league_for_user", {
      p_name: "Pelada HG", p_tier: "complete", p_visibility: "open",
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith("active_league_id", "new-league", expect.any(Object));
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("abre a configuração da sessão ao criar uma pelada descartável", async () => {
    await expect(createLeague(form("Jogo de hoje", "quick", "private")))
      .rejects.toThrow("redirect:/rodadas?create=1");
    expect(mocks.rpc).toHaveBeenCalledWith("create_league_for_user", {
      p_name: "Jogo de hoje", p_tier: "quick", p_visibility: "private",
    });
  });

  it("cria a partida rápida completa e abre direto a lista de jogadores", async () => {
    mocks.rpc.mockResolvedValue({
      data: { league_id: "quick-league", callup_id: "quick-callup", round_id: "quick-round" },
      error: null,
    });
    const data = new FormData();
    data.set("date", "2026-10-24");
    data.set("start_time", "20:30");
    data.set("field_name", "Arena do bairro");
    data.set("map_url", "https://maps.app.goo.gl/campo");

    await expect(createQuickLeague(data))
      .rejects.toThrow("redirect:/convocacao?callup=quick-callup&setup=players");
    expect(mocks.rpc).toHaveBeenCalledWith("create_quick_match_session", {
      p_date: "2026-10-24",
      p_start_time: "20:30",
      p_field_name: "Arena do bairro",
      p_map_url: "https://maps.app.goo.gl/campo",
      p_players_per_team: 5,
      p_teams_per_round: 3,
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith("active_league_id", "quick-league", expect.any(Object));
  });

  it("mantém o erro de criação e não altera a pelada ativa quando o RPC falha", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "falha" } });
    await expect(createLeague(form())).rejects.toThrow("redirect:/lobby/criar?error=create");
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("informa quando já existe uma pelada com o mesmo nome", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });
    await expect(createLeague(form())).rejects.toThrow("redirect:/lobby/criar?error=duplicate");
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

describe("pedido para pelada fechada", () => {
  it("solicita acesso pelo id e atualiza lobby e catálogo", async () => {
    const data = new FormData();
    data.set("league_id", "closed-league");
    await expect(requestClosedLeague(data)).rejects.toThrow("redirect:/peladas?requested=1");
    expect(mocks.rpc).toHaveBeenCalledWith("request_league_membership_by_id", {
      p_league_id: "closed-league",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/peladas");
    expect(mocks.revalidate).toHaveBeenCalledWith("/lobby");
  });
});
