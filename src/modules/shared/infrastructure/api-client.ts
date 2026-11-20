import { ApiError } from "../domain/api-error";

type ApiRequest = RequestInit & { json?: unknown };
type ApiErrorConstructor = new (...args: ConstructorParameters<typeof ApiError>) => ApiError;

export async function readApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return {
    message: typeof body?.message === "string" ? body.message : fallback,
    statusCode: response.status,
    fieldErrors: body?.fieldErrors && typeof body.fieldErrors === "object" && !Array.isArray(body.fieldErrors)
      ? body.fieldErrors : {},
    code: typeof body?.code === "string" ? body.code : undefined,
  };
}

export function apiClient(options: {
  accessToken?: string;
  fallback: string;
  ErrorClass?: ApiErrorConstructor;
}) {
  const { accessToken, fallback, ErrorClass = ApiError } = options;
  return async (url: string, { json, ...init }: ApiRequest = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
    if (json !== undefined) headers.set("content-type", "application/json");
    const diagnostics = typeof window === "undefined" && process.env.MATCH_PERF_DIAGNOSTICS === "1";
    const started = diagnostics ? performance.now() : 0;
    const response = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: Object.fromEntries(headers),
      body: json === undefined ? init.body : JSON.stringify(json),
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
    if (diagnostics) {
      console.info(JSON.stringify({
        event: "backend_http",
        requestId: response.headers.get("x-backend-request-id"),
        status: response.status,
        durationMs: Math.round(performance.now() - started),
      }));
    }
    if (!response.ok) {
      const error = await readApiError(response, fallback);
      throw new ErrorClass(error.message, error.statusCode, error.fieldErrors, error.code);
    }
    return response;
  };
}
