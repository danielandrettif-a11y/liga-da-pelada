import { describe, expect, it, vi } from "vitest";
import { readMyFantasyInventory, readMyFantasyInventoryCount } from "./supabase-card-inventory-reader";

function query(result: unknown) {
  const value: any = {
    select: vi.fn(() => value), eq: vi.fn(() => value), order: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
  value.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: result, count: result, error: null }).then(resolve);
  return value;
}

describe("supabase card inventory reader", () => {
  it("filtra inventário pela conta e pela pelada", async () => {
    const rows = query([{ id: "owned", card_id: "card", status: "OWNED", acquired_at: "now", consumed_at: null, card: { slug: "custom", name: "Carta" } }]);
    const result = await readMyFantasyInventory({ from: vi.fn(() => rows) } as any, "user-a", "league-a");
    expect(result.availableCount).toBe(1);
    expect(rows.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(rows.eq).toHaveBeenCalledWith("league_id", "league-a");
  });

  it("faz contagem leve com os mesmos filtros", async () => {
    const rows = query(3);
    expect(await readMyFantasyInventoryCount({ from: vi.fn(() => rows) } as any, "user-a", "league-a")).toBe(3);
    expect(rows.eq).toHaveBeenCalledWith("status", "OWNED");
  });
});
