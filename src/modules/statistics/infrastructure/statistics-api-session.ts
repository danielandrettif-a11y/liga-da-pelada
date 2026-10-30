import "server-only";

import {
  httpStatisticsGateway,
  StatisticsApiError,
  type StatisticsHttpGateway,
} from "./http-statistics-gateway";
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

export async function statisticsApiFor(
  client?: SessionClient | null,
): Promise<StatisticsHttpGateway | null> {
  if (
    process.env.STATISTICS_API_ENABLED !== "true" &&
    process.env.ENABLE_STATISTICS_API !== "true"
  ) {
    return null;
  }
  if (!client) return null;
  const {
    data: { session },
  } = await client.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return null;
  const backendUrl =
    process.env.STATISTICS_BACKEND_URL ||
    process.env.INTERNAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new StatisticsApiError("API de estatísticas não configurada.", 503);
  return httpStatisticsGateway(backendUrl, accessToken);
}

export type StatisticsApiSession = {
  gateway: StatisticsHttpGateway;
  accessToken: string;
  backendUrl: string;
};

export async function getStatisticsApiSession(
  client?: SessionClient | null,
): Promise<StatisticsApiSession | null> {
  if (
    process.env.STATISTICS_API_ENABLED !== "true" &&
    process.env.ENABLE_STATISTICS_API !== "true"
  ) {
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
    process.env.STATISTICS_BACKEND_URL ||
    process.env.INTERNAL_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new StatisticsApiError("API de estatísticas não configurada.", 503);

  const gateway = httpStatisticsGateway(backendUrl, accessToken);
  return { gateway, accessToken, backendUrl };
}
