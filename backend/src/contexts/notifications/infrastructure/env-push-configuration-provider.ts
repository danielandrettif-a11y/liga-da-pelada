import { createECDH } from "node:crypto";
import type { PushConfigurationProvider } from "../application/manage-preferences.js";

export function envPushConfigurationProvider(
  env: NodeJS.ProcessEnv = process.env,
): PushConfigurationProvider {
  const normalize = (val: string | undefined) =>
    val?.trim().replace(/^['"]|['"]$/g, "") || undefined;

  const configuredPublicKey =
    normalize(env.VAPID_PUBLIC_KEY) || normalize(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = normalize(env.VAPID_PRIVATE_KEY);
  const subject =
    normalize(env.VAPID_SUBJECT) || normalize(env.APP_PUBLIC_URL) || "http://localhost:3000";
  const subjectIsValid = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/i.test(subject);

  let derivedPublicKey: string | undefined;
  if (privateKey) {
    try {
      const key = createECDH("prime256v1");
      key.setPrivateKey(Buffer.from(privateKey, "base64url"));
      derivedPublicKey = key.getPublicKey(undefined, "uncompressed").toString("base64url");
    } catch {
      derivedPublicKey = undefined;
    }
  }

  const publicKey = derivedPublicKey || configuredPublicKey;
  const error = !privateKey
    ? "Preencha VAPID_PRIVATE_KEY no servidor."
    : !derivedPublicKey
      ? "VAPID_PRIVATE_KEY não é uma chave VAPID válida. Gere uma nova no terminal e substitua esse valor no Coolify."
      : !subjectIsValid
        ? "VAPID_SUBJECT deve ser um e-mail no formato mailto:voce@exemplo.com ou uma URL HTTPS."
        : null;

  const backgroundAlertsConfigured = Boolean(
    env.QSTASH_TOKEN &&
      env.MATCH_TIMER_WEBHOOK_SECRET &&
      (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.DATABASE_URL),
  );

  return {
    getPublicKey: () => publicKey,
    isConfigured: () => error === null && Boolean(publicKey),
    getConfigurationError: () => error,
    isBackgroundAlertsConfigured: () => backgroundAlertsConfigured,
  };
}

