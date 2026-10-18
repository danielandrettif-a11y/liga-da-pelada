import { describe, expect, it } from "vitest";
import { buildCallupInviteUrl } from "./callup-invite";

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
});
