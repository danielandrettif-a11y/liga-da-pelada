const PRODUCTION_SITE_URL = "https://pelada-de-baixa-qualidade.179.197.75.220.sslip.io";

type HeaderReader = {
  get(name: string): string | null;
};

function normalizeSiteUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function getAuthSiteUrl(requestHeaders: HeaderReader) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredSiteUrl) return normalizeSiteUrl(configuredSiteUrl);

  // O proxy de produção pode encaminhar Origin/Host como localhost.
  // Mantemos o domínio canônico como fallback até existir um domínio próprio.
  if (process.env.NODE_ENV === "production") return PRODUCTION_SITE_URL;

  const origin = requestHeaders.get("origin");
  if (origin && origin !== "null") return normalizeSiteUrl(origin);

  const protocol = requestHeaders.get("x-forwarded-proto") || "http";
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  return `${protocol}://${host}`;
}
