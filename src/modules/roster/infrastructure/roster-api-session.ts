import "server-only";

import { httpRosterGateway, RosterApiError, type RosterHttpGateway } from "./http-roster-gateway";

type SessionClient = {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token?: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

export async function rosterApiFor(client: SessionClient): Promise<RosterHttpGateway | null> {
  if (process.env.ROSTER_API_ENABLED !== "true") return null;
  const backendUrl = process.env.ROSTER_BACKEND_URL;
  if (!backendUrl) throw new RosterApiError("API de elenco não configurada.");
  const { data: { session }, error } = await client.auth.getSession();
  if (error || !session?.access_token) throw new RosterApiError("Sessão expirada. Entre novamente.");
  return httpRosterGateway(backendUrl, session.access_token);
}
