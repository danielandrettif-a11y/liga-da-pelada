import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), leagues: vi.fn(), rpc: vi.fn(), cookieSet: vi.fn(),
  revalidate: vi.fn(), redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookieSet }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("@/lib/league-context", () => ({
  ACTIVE_LEAGUE_COOKIE: "active_league_id", getMyLeagues: mocks.leagues,
}));

import { createLeague } from "./actions";

const previousFlag = process.env.MULTI_LEAGUE_CREATION_ENABLED;
afterAll(() => {
  if (previousFlag === undefined) delete process.env.MULTI_LEAGUE_CREATION_ENABLED;
  else process.env.MULTI_LEAGUE_CREATION_ENABLED = previousFlag;
});
beforeEach(() => {
  vi.resetAllMocks();
  process.env.MULTI_LEAGUE_CREATION_ENABLED = "true";
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
  it("mantém a criação fechada até o ensaio de isolamento", async () => {
    delete process.env.MULTI_LEAGUE_CREATION_ENABLED;
    await expect(createLeague(form())).rejects.toThrow("redirect:/lobby/criar?error=unavailable");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("recusa contas sem ADM antes de chamar o banco", async () => {
    mocks.leagues.mockResolvedValue([{ id: "old-league", role: "player" }]);
    await expect(createLeague(form())).rejects.toThrow("redirect:/lobby/criar?error=access");
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
    expect(mocks.rpc).toHaveBeenCalledWith("create_league_for_admin", {
      p_name: "Pelada HG", p_tier: "complete", p_visibility: "open",
    });
    expect(mocks.cookieSet).toHaveBeenCalledWith("active_league_id", "new-league", expect.any(Object));
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
});
