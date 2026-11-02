import "server-only";

import {
  httpOperationsGateway,
  OperationsApiError,
  type OperationsHttpGateway,
} from "./http-operations-gateway";

type SessionClient = {
  auth: {
    getSession(): Promise<{ data: { session: { access_token?: string } | null } }>;
  };
};

export async function operationsApi(client?: SessionClient | null): Promise<OperationsHttpGateway | null> {
  if (process.env.OPERATIONS_API_ENABLED !== "true") {
    return null;
  }

  const baseUrl = process.env.BACKEND_API_URL || "http://localhost:3001";
  const session = client ? (await client.auth.getSession()).data.session : null;
  const accessToken = session?.access_token;
  const internalToken = process.env.OPERATIONS_INTERNAL_TOKEN;
  if (!accessToken && !internalToken) return null;
  return httpOperationsGateway(baseUrl, { accessToken, internalToken });
}

export { OperationsApiError, type OperationsHttpGateway };
