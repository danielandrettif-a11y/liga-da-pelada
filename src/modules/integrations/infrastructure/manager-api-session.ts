import "server-only";

import {
  httpManagerGateway,
  ManagerApiError,
  type ManagerHttpGateway,
} from "./http-manager-gateway";
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

export async function managerApiFor(
  client?: SessionClient | null
): Promise<ManagerHttpGateway | null> {
  if (process.env.INTEGRATIONS_API_ENABLED !== "true") {
    return null;
  }

  const baseUrl = process.env.BACKEND_API_URL || "http://localhost:3001";

  if (client) {
    try {
      const { data } = await client.auth.getSession();
      if (data?.session?.access_token) {
        return httpManagerGateway(baseUrl, data.session.access_token);
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
        return httpManagerGateway(baseUrl, data.session.access_token);
      }
    }
  } catch {
    // Fallback
  }

  try {
    const serverClient = await createServerClient();
    const { data } = await serverClient.auth.getSession();
    if (data?.session?.access_token) {
      return httpManagerGateway(baseUrl, data.session.access_token);
    }
  } catch {
    // Fallback
  }

  return null;
}

export { ManagerApiError, type ManagerHttpGateway };
