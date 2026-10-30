import "server-only";

import {
  httpFinanceGateway,
  FinanceApiError,
  type FinanceHttpGateway,
} from "./http-finance-gateway";
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

export async function financeApiFor(
  client?: SessionClient | null,
): Promise<FinanceHttpGateway | null> {
  if (process.env.FINANCE_API_ENABLED !== "true") {
    return null;
  }
  if (!client) return null;
  const {
    data: { session },
  } = await client.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return null;
  const backendUrl =
    process.env.FINANCE_BACKEND_URL ||
    process.env.INTERNAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new FinanceApiError("API financeira não configurada.", 503);
  return httpFinanceGateway(backendUrl, accessToken);
}

export type FinanceApiSession = {
  gateway: FinanceHttpGateway;
  accessToken: string;
  backendUrl: string;
};

export async function getFinanceApiSession(
  client?: SessionClient | null,
): Promise<FinanceApiSession | null> {
  if (process.env.FINANCE_API_ENABLED !== "true") {
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
    error,
  } = await sessionClient.auth.getSession();
  if (error || !session?.access_token) return null;

  const backendUrl =
    process.env.FINANCE_BACKEND_URL ||
    process.env.INTERNAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new FinanceApiError("API financeira não configurada.", 503);

  return {
    gateway: httpFinanceGateway(backendUrl, session.access_token),
    accessToken: session.access_token,
    backendUrl,
  };
}

export { FinanceApiError } from "./http-finance-gateway";
