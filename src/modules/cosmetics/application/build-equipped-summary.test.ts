import { describe, expect, it } from "vitest";
import { buildEquippedCosmeticsSummary, buildPlayersEquippedCosmeticsMap } from "./build-equipped-summary";

describe("resumo de cosméticos equipados", () => {
  it("retorna null quando não existe loadout e mantém slots novos vazios no legado", () => {
    expect(buildEquippedCosmeticsSummary(null)).toBeNull();
    expect(buildEquippedCosmeticsSummary({
      user_id: "user-a", frame: { asset_key: "frame-a" }, title: { name: "Campeão" },
    })).toEqual({
      frameKey: "frame-a", auraKey: null, titleName: "Campeão", bannerAssetKey: null,
      nameplateKey: null, backgroundAssetKey: null, showcaseAssetKey: null, pitchAssetKey: null,
    });
  });

  it("mapeia todos os slots atuais e ignora relação sem valor", () => {
    expect(buildEquippedCosmeticsSummary({
      user_id: "user-a", frame: { asset_key: "frame-a" }, aura: { asset_key: "aura-a" },
      title: { name: "Lenda" }, banner: { asset_key: "banner-a" },
      nameplate: { asset_key: "nameplate-a" }, background: { asset_key: "background-a" },
      showcase: { asset_key: "showcase-a" }, pitch: { asset_key: "pitch-a" },
    })).toEqual({
      frameKey: "frame-a", auraKey: "aura-a", titleName: "Lenda", bannerAssetKey: "banner-a",
      nameplateKey: "nameplate-a", backgroundAssetKey: "background-a",
      showcaseAssetKey: "showcase-a", pitchAssetKey: "pitch-a",
    });
  });

  it("relaciona apenas loadouts dos perfis retornados", () => {
    const result = buildPlayersEquippedCosmeticsMap(
      [{ user_id: "user-a", player_id: "player-a" }, { user_id: "user-b", player_id: "player-b" }],
      [
        { user_id: "user-a", frame: { asset_key: "frame-a" } },
        { user_id: "user-outro", frame: { asset_key: "frame-outro" } },
        { user_id: "user-b", pitch: { asset_key: "pitch-b" } },
      ],
    );
    expect([...result.keys()]).toEqual(["player-a", "player-b"]);
    expect(result.get("player-a")?.frameKey).toBe("frame-a");
    expect(result.get("player-b")?.pitchAssetKey).toBe("pitch-b");
  });
});
