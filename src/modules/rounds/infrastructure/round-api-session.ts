import "server-only";

import { httpRoundGateway, RoundApiError, type RoundHttpGateway } from "./http-round-gateway";

type SessionClient = {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token?: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

export async function roundApiFor(client?: SessionClient | null): Promise<RoundHttpGateway | null> {
  if (process.env.ROUNDS_API_ENABLED !== "true") return null;
  const backendUrl = process.env.ROUNDS_BACKEND_URL;
  if (!backendUrl) throw new RoundApiError("API de rodadas não configurada.");
  let accessToken: string | undefined;
  if (client) {
    const { data: { session } } = await client.auth.getSession();
    accessToken = session?.access_token;
  }
  return httpRoundGateway(backendUrl, accessToken);
}
