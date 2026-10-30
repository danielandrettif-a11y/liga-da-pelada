import "server-only";

import {
  httpCosmeticsGateway,
  CosmeticsApiError,
  type CosmeticsHttpGateway,
} from "./http-cosmetics-gateway";
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

export async function cosmeticsApiFor(
  client?: SessionClient | null
): Promise<CosmeticsHttpGateway | null> {
  if (process.env.COSMETICS_API_ENABLED !== "true") {
    return null;
  }

  const baseUrl = process.env.BACKEND_API_URL || "http://localhost:3001";

  if (client) {
    try {
      const { data } = await client.auth.getSession();
      if (data?.session?.access_token) {
        return httpCosmeticsGateway(baseUrl, data.session.access_token);
      }
    } catch {
      // Fallback
    }
  }

  try {
    const account = await getCurrentAccount();
    if (account.client) {
      const { data } = await account.client.auth.getSession();
      if (data?.session?.access_token) {
        return httpCosmeticsGateway(baseUrl, data.session.access_token);
      }
    }
  } catch {
    // Fallback
  }

  try {
    const serverClient = await createServerClient();
    const { data } = await serverClient.auth.getSession();
    if (data?.session?.access_token) {
      return httpCosmeticsGateway(baseUrl, data.session.access_token);
    }
  } catch {
    // Fallback
  }

  return null;
}

export { CosmeticsApiError, type CosmeticsHttpGateway };
