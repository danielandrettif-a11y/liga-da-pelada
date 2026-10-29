import { describe, expect, it } from "vitest";
import { isFantasyMarketPlayerEligible, parseFantasyMarketReadModel } from "./market-read-model";

describe("parseFantasyMarketReadModel", () => {
  it("normaliza o payload retornado pela RPC", () => {
    expect(parseFantasyMarketReadModel({ prices: [{ id: 1 }], players: [] }, false)).toEqual({
      prices: [{ id: 1 }],
      stats: [],
      players: [],
      history: [],
    });
  });

  it("ativa o fallback quando a RPC ainda não existe", () => {
    expect(parseFantasyMarketReadModel({ prices: [] }, true)).toBeNull();
    expect(parseFantasyMarketReadModel(null, false)).toBeNull();
  });
});

describe("isFantasyMarketPlayerEligible", () => {
  it("mantém no mercado o perfil completo convocado mesmo sem atividade recente", () => {
    expect(isFantasyMarketPlayerEligible({
      profileComplete: true,
      enforceRecentActivity: true,
      activeRecently: false,
      isCalledUp: true,
    })).toBe(true);
  });

  it("continua ocultando quem não jogou recentemente nem está na convocação", () => {
    expect(isFantasyMarketPlayerEligible({
      profileComplete: true,
      enforceRecentActivity: true,
      activeRecently: false,
      isCalledUp: false,
    })).toBe(false);
  });

  it("não libera perfil incompleto apenas por estar na convocação", () => {
    expect(isFantasyMarketPlayerEligible({
      profileComplete: false,
      enforceRecentActivity: true,
      activeRecently: false,
      isCalledUp: true,
    })).toBe(false);
  });
});
