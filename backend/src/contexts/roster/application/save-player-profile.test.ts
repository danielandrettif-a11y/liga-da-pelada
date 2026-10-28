import { describe, expect, it, vi } from "vitest";
import { deletePlayerProfile, savePlayerProfile } from "./save-player-profile.js";

const leagueId = "00000000-0000-4000-8000-000000000010";
const playerId = "00000000-0000-4000-8000-000000000001";
const actor = { userId: "verified-user" };
const current = {
  profileBio: null, avatarUrl: `http://storage/player-avatars/${playerId}/old.png`, avatarAlternateUrl: null,
  memberCategory: "guest" as const, isSelectable: true, playerProfile: "offensive" as const,
  overallTraits: ["offensive" as const], isGoalkeeper: false,
};

function fixture(access = { isLeagueAdmin: true, isOwner: false, current }) {
  const repository = {
    getSaveAccess: vi.fn().mockResolvedValue(access), saveProfile: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue({ avatarUrl: current.avatarUrl, avatarAlternateUrl: null }),
  };
  const storage = {
    upload: vi.fn().mockResolvedValue({ path: `${playerId}/new.png`, publicUrl: `http://storage/player-avatars/${playerId}/new.png` }),
    remove: vi.fn().mockResolvedValue(undefined),
    pathFromPublicUrl: vi.fn((url: string | null) => url?.split("player-avatars/")[1] || null),
  };
  return { repository, storage };
}

describe("save player profile application", () => {
  it("uploads the new avatar, persists its URL and removes the replaced object", async () => {
    const { repository, storage } = fixture();
    await expect(savePlayerProfile(leagueId, playerId, {
      name: "Jogador", member_category: "guest",
      activeAvatar: { contentType: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]) },
    }, actor, "token", repository, storage)).resolves.toBe(playerId);
    expect(repository.saveProfile).toHaveBeenCalledWith(
      leagueId, expect.objectContaining({ playerId, avatarUrl: expect.stringContaining("new.png") }), false, actor,
    );
    expect(storage.remove).toHaveBeenCalledWith([`${playerId}/old.png`], "token");
  });

  it("compensates a provisional create when an upload fails", async () => {
    const { repository, storage } = fixture({ isLeagueAdmin: true, isOwner: false, current: null });
    storage.upload.mockRejectedValue(new Error("storage failed"));
    await expect(savePlayerProfile(leagueId, null, {
      name: "Convidado", member_category: "guest",
      activeAvatar: { contentType: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]) },
    }, actor, "token", repository, storage)).rejects.toThrow("storage failed");
    expect(repository.saveProfile).toHaveBeenCalledWith(leagueId, expect.any(Object), true, actor);
    expect(repository.delete).toHaveBeenCalledWith(leagueId, expect.any(String), actor);
  });

  it("deletes persistence first and performs bounded best-effort storage cleanup", async () => {
    const { repository, storage } = fixture();
    await expect(deletePlayerProfile(leagueId, playerId, actor, "token", repository, storage))
      .resolves.toBeUndefined();
    expect(repository.delete).toHaveBeenCalledWith(leagueId, playerId, actor);
    expect(storage.remove).toHaveBeenCalledWith([`${playerId}/old.png`], "token");
  });
});
