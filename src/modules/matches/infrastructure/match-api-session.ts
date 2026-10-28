import "server-only";

import { httpMatchGateway, MatchApiError, type MatchHttpGateway } from "./http-match-gateway";

type SessionClient = {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token?: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

export async function matchApiFor(client?: SessionClient | null): Promise<MatchHttpGateway | null> {
  if (process.env.MATCHES_API_ENABLED !== "true") return null;
  if (!client) return null;
  const { data: { session } } = await client.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return null;
  const backendUrl = process.env.MATCHES_BACKEND_URL || process.env.MATCH_GOAL_BACKEND_URL;
  if (!backendUrl) throw new MatchApiError("API de partidas não configurada.");
  return httpMatchGateway(backendUrl, accessToken);
}
