import "server-only";

import { httpIdentityGateway, IdentityApiError, type IdentityHttpGateway } from "./http-identity-gateway";

type SessionClient = {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token?: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

export async function identityApiFor(client: SessionClient): Promise<IdentityHttpGateway | null> {
  if (process.env.IDENTITY_API_ENABLED !== "true") return null;
  const backendUrl = process.env.IDENTITY_BACKEND_URL;
  if (!backendUrl) throw new IdentityApiError("API de identidade não configurada.");
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session?.access_token) throw new IdentityApiError("Sessão expirada. Entre novamente.");
  return httpIdentityGateway(backendUrl, session.access_token);
}

export function identityPublicApi(): IdentityHttpGateway | null {
  if (process.env.IDENTITY_API_ENABLED !== "true") return null;
  const backendUrl = process.env.IDENTITY_BACKEND_URL;
  if (!backendUrl) throw new IdentityApiError("API de identidade não configurada.");
  return httpIdentityGateway(backendUrl);
}
