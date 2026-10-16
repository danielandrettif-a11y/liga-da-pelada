import { afterEach, describe, expect, it, vi } from "vitest";
import { requestOrigin, SITE_URL } from "./siteUrl";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requestOrigin", () => {
  it("mantém localhost durante o desenvolvimento", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(requestOrigin({ url: "http://localhost:3000/auth/reentry" })).toBe("http://localhost:3000");
  });

  it("nunca envia o navegador para localhost em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(requestOrigin({ url: "http://localhost:3000/auth/reentry" })).toBe(SITE_URL);
  });
});
