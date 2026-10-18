import { describe, expect, it } from "vitest";
import { buildCallupInviteUrl } from "./callup-invite";
import { SITE_URL } from "./siteUrl";

describe("buildCallupInviteUrl", () => {
  it("gera um convite compacto usando apenas o token", () => {
    expect(buildCallupInviteUrl("8a-a11525-ad0e")).toBe(
      `${SITE_URL}/c/8a-a11525-ad0e`,
    );
  });

  it("codifica o token antes de inseri-lo na URL", () => {
    expect(buildCallupInviteUrl("token com espaço")).toBe(
      `${SITE_URL}/c/token%20com%20espa%C3%A7o`,
    );
  });
});
