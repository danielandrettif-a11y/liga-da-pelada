import "server-only";

import { httpLeagueGateway, LeagueApiError, type LeagueHttpGateway } from "./http-league-gateway";

type SessionClient = {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token?: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

export async function leagueApiFor(client: SessionClient): Promise<LeagueHttpGateway | null> {
  if (process.env.LEAGUE_API_ENABLED !== "true") return null;
  const backendUrl = process.env.LEAGUE_BACKEND_URL;
  if (!backendUrl) throw new LeagueApiError("API de peladas não configurada.");
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session?.access_token) {
    throw new LeagueApiError("Sessão expirada. Entre novamente.");
  }
  return httpLeagueGateway(backendUrl, session.access_token);
}
