import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_PREFIX = "identity-pkce-";

export type IdentityPkceFlow = { flowId: string; codeVerifier: string; codeChallenge: string };

export function createIdentityPkceFlow(): IdentityPkceFlow {
  const flowId = randomBytes(16).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { flowId, codeVerifier, codeChallenge };
}

export async function storeIdentityPkceVerifier(flow: IdentityPkceFlow): Promise<void> {
  (await cookies()).set(`${COOKIE_PREFIX}${flow.flowId}`, flow.codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/callback",
    maxAge: 60 * 60,
  });
}

export async function consumeIdentityPkceVerifier(flowId: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(flowId)) return null;
  const cookieStore = await cookies();
  const name = `${COOKIE_PREFIX}${flowId}`;
  const verifier = cookieStore.get(name)?.value || null;
  cookieStore.set(name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/callback",
    maxAge: 0,
  });
  return verifier;
}
