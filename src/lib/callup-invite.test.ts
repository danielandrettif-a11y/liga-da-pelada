import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCallupInviteUrl, shareCallupInvite } from "./callup-invite";

afterEach(() => vi.unstubAllGlobals());

describe("buildCallupInviteUrl", () => {
  it("gera um link curto reconhecível pelo WhatsApp", () => {
    expect(buildCallupInviteUrl("https://pelada.example", "invite-456")).toBe(
      "https://pelada.example/c/invite-456",
    );
  });

  it("preserva a origem instalada e codifica o token no caminho", () => {
    expect(buildCallupInviteUrl("https://app.example:8443", "token/com espaço")).toBe(
      "https://app.example:8443/c/token%2Fcom%20espa%C3%A7o",
    );
  });

  it("entrega a URL como campo estruturado ao compartilhamento nativo", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    await expect(shareCallupInvite({
      title: "Convocação",
      text: "Confirme sua presença",
      url: "https://pelada.example/c/invite-456",
    })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "Convocação",
      text: "Confirme sua presença",
      url: "https://pelada.example/c/invite-456",
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("coloca o link na primeira linha quando precisa copiar", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(shareCallupInvite({
      title: "Convocação",
      text: "Confirme sua presença",
      url: "https://pelada.example/c/invite-456",
    })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(
      "https://pelada.example/c/invite-456\n\nConfirme sua presença",
    );
  });
});
