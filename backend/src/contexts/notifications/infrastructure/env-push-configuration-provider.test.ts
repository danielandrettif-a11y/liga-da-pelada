import { describe, expect, it } from "vitest";
import { generateVAPIDKeys } from "web-push";
import { envPushConfigurationProvider } from "./env-push-configuration-provider.js";

describe("envPushConfigurationProvider", () => {
  it("detects unconfigured VAPID environment", () => {
    const provider = envPushConfigurationProvider({});
    expect(provider.isConfigured()).toBe(false);
    expect(provider.getConfigurationError()).toBe("Preencha VAPID_PRIVATE_KEY no servidor.");
  });

  it("derives public key and reports configured status with valid keys", () => {
    const keys = generateVAPIDKeys();
    const provider = envPushConfigurationProvider({
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: "mailto:admin@exemplo.com",
      QSTASH_TOKEN: "token",
      MATCH_TIMER_WEBHOOK_SECRET: "secret",
      DATABASE_URL: "postgres://localhost",
    });

    expect(provider.isConfigured()).toBe(true);
    expect(provider.getPublicKey()).toBe(keys.publicKey);
    expect(provider.getConfigurationError()).toBeNull();
    expect(provider.isBackgroundAlertsConfigured()).toBe(true);
  });
});

