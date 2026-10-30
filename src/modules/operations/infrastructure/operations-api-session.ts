import "server-only";

import {
  httpOperationsGateway,
  OperationsApiError,
  type OperationsHttpGateway,
} from "./http-operations-gateway";

export async function operationsApi(): Promise<OperationsHttpGateway | null> {
  if (process.env.OPERATIONS_API_ENABLED !== "true") {
    return null;
  }

  const baseUrl = process.env.BACKEND_API_URL || "http://localhost:3001";
  return httpOperationsGateway(baseUrl);
}

export { OperationsApiError, type OperationsHttpGateway };
