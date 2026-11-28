import { createHmac, timingSafeEqual } from "node:crypto";

export const PROXY_AUTH_HEADER = "x-liga-proxy-auth";
const PROXY_AUTH_TTL_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProxyAuthUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
};

type ProxyAuthPayload = ProxyAuthUser & {
  exp: number;
};

function resolveProxyAuthSecret(): string | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.MATCH_TIMER_WEBHOOK_SECRET
    || process.env.EMAIL_UNSUBSCRIBE_SECRET
    || "";
  return secret.length > 0 ? secret : null;
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`liga-proxy-auth:v1:${encodedPayload}`)
    .digest("base64url");
}

export function signProxyAuthUser(
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null },
  now: () => number = Date.now,
): string | null {
  const secret = resolveProxyAuthSecret();
  if (!secret || !UUID_PATTERN.test(user.id)) return null;

  const metadata = user.user_metadata && typeof user.user_metadata === "object"
    ? {
        name: typeof user.user_metadata.name === "string" ? user.user_metadata.name : undefined,
        full_name: typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : undefined,
        display_name: typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name : undefined,
        avatar_url: typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : undefined,
        picture: typeof user.user_metadata.picture === "string" ? user.user_metadata.picture : undefined,
      }
    : {};

  const payload: ProxyAuthPayload = {
    id: user.id,
    email: typeof user.email === "string" ? user.email : null,
    user_metadata: metadata,
    exp: now() + PROXY_AUTH_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signPayload(encoded, secret)}`;
}

export function verifyProxyAuthUser(
  headerValue: string | null | undefined,
  now: () => number = Date.now,
): ProxyAuthUser | null {
  if (!headerValue) return null;
  const secret = resolveProxyAuthSecret();
  if (!secret) return null;

  const dotIndex = headerValue.indexOf(".");
  if (dotIndex <= 0 || dotIndex === headerValue.length - 1) return null;
  const encoded = headerValue.slice(0, dotIndex);
  const signature = headerValue.slice(dotIndex + 1);
  if (!encoded || !signature) return null;

  const expected = signPayload(encoded, secret);
  const actualBuf = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<ProxyAuthPayload>;
    if (!decoded || typeof decoded.id !== "string" || !UUID_PATTERN.test(decoded.id)) return null;
    if (typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp) || decoded.exp <= now()) return null;
    return {
      id: decoded.id,
      email: typeof decoded.email === "string" ? decoded.email : null,
      user_metadata: decoded.user_metadata && typeof decoded.user_metadata === "object"
        ? decoded.user_metadata
        : {},
    };
  } catch {
    return null;
  }
}
