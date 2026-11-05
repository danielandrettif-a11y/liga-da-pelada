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
  it("mantém qualquer perfil completo no mercado, mesmo após várias ausências", () => {
    expect(isFantasyMarketPlayerEligible({ profileComplete: true })).toBe(true);
  });

  it("continua ocultando perfil incompleto", () => {
    expect(isFantasyMarketPlayerEligible({ profileComplete: false })).toBe(false);
  });
});
