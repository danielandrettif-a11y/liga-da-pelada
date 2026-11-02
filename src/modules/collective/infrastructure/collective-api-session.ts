import "server-only";

import {
  httpCollectiveGateway,
  CollectiveApiError,
  type CollectiveHttpGateway,
} from "./http-collective-gateway";
import { getCurrentAccount } from "@/lib/auth";
import { createClient as createServerClient } from "@/lib/supabase/server";

type SessionClient = {
  auth: {
    getSession(): Promise<{
      data: { session: { access_token?: string } | null };
      error: { message?: string } | null;
    }>;
  };
  storage?: {
    from(bucket: string): {
      createSignedUrls(paths: string[], expiresIn: number): Promise<{
        data: Array<{ signedUrl?: string | null }> | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

function createMediaSigner(client?: SessionClient | null) {
  if (!client?.storage) return undefined;
  return async (paths: string[]) => {
    const { data, error } = await client.storage!.from("collective-media").createSignedUrls(paths, 3600);
    if (error) throw new Error(error.message || "Não foi possível assinar a mídia da Coletiva.");
    const result = new Map<string, string>();
    (data || []).forEach((item, index) => {
      if (item.signedUrl && paths[index]) result.set(paths[index], item.signedUrl);
    });
    return result;
  };
}

export async function collectiveApiFor(
  client?: SessionClient | null
): Promise<CollectiveHttpGateway | null> {
  if (process.env.COLLECTIVE_API_ENABLED !== "true") {
    return null;
  }

  const baseUrl = process.env.BACKEND_API_URL || "http://localhost:3001";

  if (client) {
    try {
      const { data } = await client.auth.getSession();
      if (data?.session?.access_token) {
        return httpCollectiveGateway(baseUrl, data.session.access_token, fetch, createMediaSigner(client));
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
        return httpCollectiveGateway(baseUrl, data.session.access_token, fetch, createMediaSigner(account.client));
      }
    }
  } catch {
    // Fallback
  }

  try {
    const serverClient = await createServerClient();
    const { data } = await serverClient.auth.getSession();
    if (data?.session?.access_token) {
      return httpCollectiveGateway(baseUrl, data.session.access_token, fetch, createMediaSigner(serverClient));
    }
  } catch {
    // Fallback
  }

  return null;
}

export { CollectiveApiError, type CollectiveHttpGateway };
