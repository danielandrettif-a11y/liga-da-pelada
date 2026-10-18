import { describe, expect, it, vi } from "vitest";
import { resolveAdminCosmeticsPreview, type AdminPreviewGateway } from "./admin-preview";

function setup() {
  const gateway = {
    findCosmeticsByIds: vi.fn().mockResolvedValue([
      { id: "frame-a", slot: "frame", asset_key: "frame-asset", name: "Moldura" },
      { id: "title-a", slot: "title", asset_key: null, name: "Artilheiro" },
      { id: "pitch-a", slot: "pitch", asset_key: "pitch-asset", name: "Campo" },
    ]),
  } satisfies AdminPreviewGateway;
  const input = { isAdmin: true, ownPlayerId: "player-a", playerId: "player-a", requested: { frame: "frame-a" } };
  return { gateway, input };
}

describe("prévia administrativa dos cosméticos", () => {
  it("nega não administradores e perfis de outra pessoa antes da consulta", async () => {
    const { gateway, input } = setup();
    expect(await resolveAdminCosmeticsPreview({ ...input, isAdmin: false }, gateway)).toBeNull();
    expect(await resolveAdminCosmeticsPreview({ ...input, ownPlayerId: "player-b" }, gateway)).toBeNull();
    expect(await resolveAdminCosmeticsPreview({ ...input, ownPlayerId: null }, gateway)).toBeNull();
    expect(gateway.findCosmeticsByIds).not.toHaveBeenCalled();
  });

  it("ignora slots adulterados e IDs de tipos inválidos sem consultar o banco", async () => {
    const { gateway, input } = setup();
    const requested = { frame: 42, unknown: "frame-a" } as unknown as typeof input.requested;
    expect(await resolveAdminCosmeticsPreview({ ...input, requested }, gateway)).toBeNull();
    expect(await resolveAdminCosmeticsPreview({ ...input, requested: {} }, gateway)).toBeNull();
    expect(gateway.findCosmeticsByIds).not.toHaveBeenCalled();
  });

  it("confere o slot de cada cosmético vindo do catálogo", async () => {
    const { gateway, input } = setup();
    const preview = await resolveAdminCosmeticsPreview({
      ...input,
      requested: { frame: "title-a", title: "title-a", pitch: "pitch-a", aura: "missing" },
    }, gateway);
    expect(gateway.findCosmeticsByIds).toHaveBeenCalledWith(["title-a", "pitch-a", "missing"]);
    expect(preview).toEqual({
      frameKey: null, auraKey: null, titleName: "Artilheiro", bannerAssetKey: null,
      nameplateKey: null, backgroundAssetKey: null, showcaseAssetKey: null, pitchAssetKey: "pitch-asset",
    });
  });

  it("não devolve prévia quando a consulta falha", async () => {
    const { gateway, input } = setup();
    gateway.findCosmeticsByIds.mockResolvedValueOnce(null);
    expect(await resolveAdminCosmeticsPreview(input, gateway)).toBeNull();
  });

  it("mantém uma prévia vazia quando nenhum ID existe no catálogo", async () => {
    const { gateway, input } = setup();
    gateway.findCosmeticsByIds.mockResolvedValueOnce([]);
    expect(await resolveAdminCosmeticsPreview(input, gateway)).toEqual({
      frameKey: null, auraKey: null, titleName: null, bannerAssetKey: null,
      nameplateKey: null, backgroundAssetKey: null, showcaseAssetKey: null, pitchAssetKey: null,
    });
  });
});
