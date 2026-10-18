import { describe, expect, it } from "vitest";
import { buildCallupInviteUrl } from "./callup-invite";

describe("buildCallupInviteUrl", () => {
  it("leva diretamente para a convocação identificada", () => {
    expect(buildCallupInviteUrl("https://pelada.example", "callup-123", "invite-456")).toBe(
      "https://pelada.example/convocacao?callup=callup-123&invite=invite-456",
    );
  });

  it("preserva a origem instalada e codifica os parâmetros", () => {
    expect(buildCallupInviteUrl("https://app.example:8443", "chamada com espaço", "token/com barra")).toBe(
      "https://app.example:8443/convocacao?callup=chamada+com+espa%C3%A7o&invite=token%2Fcom+barra",
    );
  });
});
