import { describe, it, expect, vi } from "vitest";
import { ManageCollectiveUseCase, type CollectiveRepository } from "./manage-collective.js";
import type { Actor } from "../../../shared/actor.js";

describe("ManageCollectiveUseCase", () => {
  const userId = "00000000-0000-0000-0000-000000000001";
  const leagueId = "00000000-0000-0000-0000-000000000002";
  const callupId = "00000000-0000-0000-0000-000000000003";
  const actor: Actor = { userId, email: "user1@test.com", name: "User 1" };

  const createMockRepo = (): CollectiveRepository => ({
    getPreviousCallupId: vi.fn().mockResolvedValue({ callupId: null }),
    getCandidates: vi.fn().mockResolvedValue([]),
    getPage: vi.fn().mockResolvedValue(null),
    sendMessage: vi.fn().mockResolvedValue({ success: true, messageId: "m1" }),
    editMessage: vi.fn().mockResolvedValue({ success: true }),
    deleteMessage: vi.fn().mockResolvedValue({ success: true }),
    markRead: vi.fn().mockResolvedValue({ success: true }),
  });

  it("validates text and media before sending", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCollectiveUseCase(repo);

    // Empty body without media should fail
    const sendEmpty = await useCase.sendMessage(actor, leagueId, { callupId, body: "", kind: "text" });
    expect(sendEmpty.success).toBe(false);
    expect(repo.sendMessage).not.toHaveBeenCalled();

    // Valid message should delegate
    const sendValid = await useCase.sendMessage(actor, leagueId, { callupId, body: "Bom jogo!", kind: "text" });
    expect(sendValid.success).toBe(true);
    expect(repo.sendMessage).toHaveBeenCalled();

    const imagePath = `${callupId}/${userId}/00000000-0000-0000-0000-000000000004.png`;
    const sendImage = await useCase.sendMessage(actor, leagueId, {
      callupId, body: "", kind: "image", mediaPath: imagePath, mediaMime: "image/png", mediaSize: 4,
    });
    expect(sendImage.success).toBe(true);
    expect(repo.sendMessage).toHaveBeenLastCalledWith(actor, leagueId, expect.objectContaining({ body: "Imagem", mediaPath: imagePath }));

    const wrongOwner = await useCase.sendMessage(actor, leagueId, {
      callupId, body: "", kind: "image", mediaPath: `${callupId}/00000000-0000-0000-0000-000000000099/file.png`, mediaMime: "image/png", mediaSize: 4,
    });
    expect(wrongOwner).toMatchObject({ success: false, error: "Caminho de mídia inválido." });

    const invalidAudio = await useCase.sendMessage(actor, leagueId, {
      callupId, body: "", kind: "audio", mediaPath: `${callupId}/${userId}/00000000-0000-0000-0000-000000000005.webm`, mediaMime: "audio/webm", mediaSize: 4, duration: 61,
    });
    expect(invalidAudio).toMatchObject({ success: false });

    // Edit validation
    const editEmpty = await useCase.editMessage(actor, leagueId, callupId, "  ");
    expect(editEmpty.success).toBe(false);
    expect(repo.editMessage).not.toHaveBeenCalled();

    const editValid = await useCase.editMessage(actor, leagueId, callupId, "Texto editado");
    expect(editValid.success).toBe(true);
    expect(repo.editMessage).toHaveBeenCalledWith(actor, leagueId, callupId, "Texto editado");
  });

  it("delegates deletion and read marks", async () => {
    const repo = createMockRepo();
    const useCase = new ManageCollectiveUseCase(repo);

    await useCase.deleteMessage(actor, leagueId, callupId);
    expect(repo.deleteMessage).toHaveBeenCalledWith(actor, leagueId, callupId);

    await useCase.markRead(actor, leagueId, [{ callupId, messageId: callupId }]);
    expect(repo.markRead).toHaveBeenCalledWith(actor, leagueId, [{ callupId, messageId: callupId }]);
  });
});
