import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCallupInviteMessage, buildCallupInviteUrl, shareCallupInvite } from "./callup-invite";

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

  it("mantém o convite do app como primeiro e único link da mensagem", () => {
    const message = buildCallupInviteMessage({
      url: "https://pelada.example/c/invite-456",
      heading: "CONVOCAÇÃO ABERTA",
      roundLabel: "Pelada Oficial (Ranked)",
      date: "sábado, 24/10",
      time: "16:00",
      stadiumName: "Bola Cheia Campo Society",
    });

    expect(message.startsWith("https://pelada.example/c/invite-456\n\n")).toBe(true);
    expect(message.match(/https?:\/\//g)).toHaveLength(1);
    expect(message).toContain("📍 *Local:* Bola Cheia Campo Society");
  });

  it("compartilha a mensagem inteira sem separar a URL no WhatsApp", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    await expect(shareCallupInvite({
      title: "Convocação",
      text: "https://pelada.example/c/invite-456\n\nConfirme sua presença",
    })).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "Convocação",
      text: "https://pelada.example/c/invite-456\n\nConfirme sua presença",
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copia a mesma mensagem sem remontar ou duplicar o link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(shareCallupInvite({
      title: "Convocação",
      text: "https://pelada.example/c/invite-456\n\nConfirme sua presença",
    })).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(
      "https://pelada.example/c/invite-456\n\nConfirme sua presença",
    );
  });
});
