import type { Instrumentation } from "next";
import { reportServerEvent } from "@/lib/observability";

export function register() {
  console.info(`[observability] server_started runtime=${process.env.NEXT_RUNTIME || "unknown"}`);
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error
    ? String(error.digest)
    : undefined;

  await reportServerEvent({
    kind: "server_error",
    name: "next_request_error",
    message: error instanceof Error ? error.message : String(error),
    digest,
    path: request.path,
    metadata: {
      method: request.method,
      route: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    },
  });
};
