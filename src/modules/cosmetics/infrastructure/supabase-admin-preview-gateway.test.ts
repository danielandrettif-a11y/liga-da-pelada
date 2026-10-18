import { describe, expect, it, vi } from "vitest";
import { supabaseAdminPreviewGateway } from "./supabase-admin-preview-gateway";

function setup(data: unknown = [], error: unknown = null) {
  const query = { in: vi.fn().mockResolvedValue({ data, error }) };
  const table = { select: vi.fn().mockReturnValue(query) };
  const client = { from: vi.fn().mockReturnValue(table) } as unknown as Parameters<typeof supabaseAdminPreviewGateway>[0];
  return { gateway: supabaseAdminPreviewGateway(client), client, table, query };
}

describe("consulta do catálogo para prévia administrativa", () => {
  it("consulta apenas os IDs solicitados e campos necessários", async () => {
    const { gateway, client, table, query } = setup([
      { id: "frame-a", slot: "frame", asset_key: "frame-asset", name: "Moldura" },
    ]);
    expect(await gateway.findCosmeticsByIds(["frame-a"])).toHaveLength(1);
    expect(client.from).toHaveBeenCalledWith("fantasy_cosmetics");
    expect(table.select).toHaveBeenCalledWith("id, slot, asset_key, name");
    expect(query.in).toHaveBeenCalledWith("id", ["frame-a"]);
  });

  it("distingue falha da consulta de catálogo vazio", async () => {
    expect(await setup([], { message: "erro" }).gateway.findCosmeticsByIds(["x"])).toBeNull();
    expect(await setup().gateway.findCosmeticsByIds(["x"])).toEqual([]);
  });
});
