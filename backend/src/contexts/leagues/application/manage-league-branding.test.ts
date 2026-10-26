import { describe, expect, it, vi } from "vitest";
import { updateLeagueBranding } from "./manage-league-branding.js";

const leagueId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("updateLeagueBranding", () => {
  it("uploads new media, persists URLs and removes replaced objects after success", async () => {
    const repository = {
      getCurrent: vi.fn().mockResolvedValue({ logoUrl: "https://public/storage/v1/object/public/league-branding/old.png", coverUrl: null }),
      update: vi.fn().mockResolvedValue(undefined),
    };
    const storage = {
      upload: vi.fn().mockResolvedValue({ path: `${leagueId}/logo-new.png`, publicUrl: "https://public/new.png" }),
      remove: vi.fn().mockResolvedValue(undefined),
      pathFromPublicUrl: vi.fn((url: string | null) => url ? `${leagueId}/old.png` : null),
    };
    const result = await updateLeagueBranding(leagueId, {
      accent_color: "#AABBCC", logo: { contentType: "image/png", bytes: pngBytes },
    }, actor, "token", repository, storage);
    expect(repository.update).toHaveBeenCalledWith(
      leagueId, { accentColor: "#aabbcc", logoUrl: "https://public/new.png" }, actor,
    );
    expect(storage.remove).toHaveBeenCalledWith([`${leagueId}/old.png`], "token");
    expect(result).toEqual({ logoUrl: "https://public/new.png", coverUrl: undefined, accentColor: "#aabbcc" });
  });

  it("compensates uploaded objects when database persistence fails", async () => {
    const repository = {
      getCurrent: vi.fn().mockResolvedValue({ logoUrl: null, coverUrl: null }),
      update: vi.fn().mockRejectedValue(new Error("database failed")),
    };
    const storage = {
      upload: vi.fn().mockResolvedValue({ path: `${leagueId}/logo-new.png`, publicUrl: "https://public/new.png" }),
      remove: vi.fn().mockResolvedValue(undefined),
      pathFromPublicUrl: vi.fn(),
    };
    await expect(updateLeagueBranding(leagueId, {
      accent_color: "#aabbcc", logo: { contentType: "image/png", bytes: pngBytes },
    }, actor, "token", repository, storage)).rejects.toThrow("database failed");
    expect(storage.remove).toHaveBeenCalledWith([`${leagueId}/logo-new.png`], "token");
  });
});
