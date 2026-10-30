import "server-only";

import {
  httpFantasyGateway,
  FantasyApiError,
  type FantasyHttpGateway,
} from "./http-fantasy-gateway";
import { getCurrentAccount } from "@/lib/auth";
import { createClient as createServerClient } from "@/lib/supabase/server";

type SessionClient = {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token?: string } | null };
      error: { message?: string } | null;
    }>;
  };
};

export async function fantasyApiFor(
  client?: SessionClient | null
): Promise<FantasyHttpGateway | null> {
  if (process.env.FANTASY_API_ENABLED !== "true") {
    return null;
  }
  if (!client) return null;
  const {
    data: { session },
  } = await client.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return null;
  const backendUrl =
    process.env.FANTASY_BACKEND_URL ||
    process.env.INTERNAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new FantasyApiError("API de Fantasy não configurada.", 503);
  return httpFantasyGateway(backendUrl, accessToken);
}

export type FantasyApiSession = {
  gateway: FantasyHttpGateway;
  accessToken: string;
  backendUrl: string;
};

export async function getFantasyApiSession(
  client?: SessionClient | null
): Promise<FantasyApiSession | null> {
  if (process.env.FANTASY_API_ENABLED !== "true") {
    return null;
  }

  let sessionClient = client;
  if (!sessionClient) {
    const account = await getCurrentAccount().catch(() => null);
    if (account?.client) {
      sessionClient = account.client;
    } else {
      sessionClient = (await createServerClient().catch(() => null)) as SessionClient | null;
    }
  }

  if (!sessionClient) return null;

  const {
    data: { session },
  } = await sessionClient.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return null;

  const backendUrl =
    process.env.FANTASY_BACKEND_URL ||
    process.env.INTERNAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new FantasyApiError("API de Fantasy não configurada.", 503);

  return {
    gateway: httpFantasyGateway(backendUrl, accessToken),
    accessToken,
    backendUrl,
  };
}
