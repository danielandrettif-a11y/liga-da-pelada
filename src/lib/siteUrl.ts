const PRODUCTION_SITE_URL = "https://pelada-de-baixa-qualidade.179.197.75.220.sslip.io";

type HeaderReader = {
  get(name: string): string | null;
};

function normalizeSiteUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isLocalSiteUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return true;
  }
}

export function getAuthSiteUrl(requestHeaders: HeaderReader) {
  const isProduction = process.env.NODE_ENV === "production";
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredSiteUrl && (!isProduction || !isLocalSiteUrl(configuredSiteUrl))) {
    return normalizeSiteUrl(configuredSiteUrl);
  }

  // O proxy de produção pode encaminhar Origin/Host como localhost.
  // Uma variável de ambiente local também é ignorada para nunca vazar localhost no OAuth.
  if (isProduction) return PRODUCTION_SITE_URL;

  const origin = requestHeaders.get("origin");
  if (origin && origin !== "null") return normalizeSiteUrl(origin);

  const protocol = requestHeaders.get("x-forwarded-proto") || "http";
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  return `${protocol}://${host}`;
}
