import "server-only";

import { createClient } from "@/lib/supabase/server";
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
  if (client === null) return null;
  const sessionClient = client ?? await createClient();
  const { data: { session } } = await sessionClient.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return null;
  const backendUrl = process.env.ROUNDS_BACKEND_URL || process.env.INTERNAL_BACKEND_URL || process.env.BACKEND_API_URL;
  if (!backendUrl) throw new RoundApiError("API de rodadas não configurada.");
  return httpRoundGateway(backendUrl, accessToken);
}
