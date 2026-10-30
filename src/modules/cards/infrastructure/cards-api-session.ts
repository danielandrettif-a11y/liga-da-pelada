import "server-only";

import {
  httpCardsGateway,
  CardsApiError,
  type CardsHttpGateway,
} from "./http-cards-gateway";
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

export async function cardsApiFor(
  client?: SessionClient | null
): Promise<CardsHttpGateway | null> {
  if (process.env.CARDS_API_ENABLED !== "true") {
    return null;
  }
  if (!client) return null;
  const {
    data: { session },
  } = await client.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return null;
  const backendUrl =
    process.env.CARDS_BACKEND_URL ||
    process.env.INTERNAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new CardsApiError("API de Cartas não configurada.", 503);
  return httpCardsGateway(backendUrl, accessToken);
}

export type CardsApiSession = {
  gateway: CardsHttpGateway;
  accessToken: string;
  backendUrl: string;
};

export async function getCardsApiSession(
  client?: SessionClient | null
): Promise<CardsApiSession | null> {
  if (process.env.CARDS_API_ENABLED !== "true") {
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
    process.env.CARDS_BACKEND_URL ||
    process.env.INTERNAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new CardsApiError("API de Cartas não configurada.", 503);

  return {
    gateway: httpCardsGateway(backendUrl, accessToken),
    accessToken,
    backendUrl,
  };
}
