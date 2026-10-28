import "server-only";

import { httpCallupGateway, CallupApiError, type CallupHttpGateway } from "./http-callup-gateway";

type SessionClient = {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token?: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

export async function callupApiFor(client?: SessionClient | null): Promise<CallupHttpGateway | null> {
  if (process.env.CALLUPS_API_ENABLED !== "true") return null;
  const backendUrl = process.env.CALLUPS_BACKEND_URL;
  if (!backendUrl) throw new CallupApiError("API de convocações não configurada.");
  let accessToken: string | undefined;
  if (client) {
    const { data: { session } } = await client.auth.getSession();
    accessToken = session?.access_token;
  }
  return httpCallupGateway(backendUrl, accessToken);
}
