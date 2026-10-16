export const SITE_URL = "https://pelada-de-baixa-qualidade.179.197.75.220.sslip.io";
export const AUTH_CALLBACK_URL = `${SITE_URL}/auth/callback`;

/**
 * O proxy reverso do servidor pode entregar ao Next uma URL interna em
 * localhost. Redirecionamentos enviados ao navegador nunca devem expor essa
 * origem fora do ambiente de desenvolvimento.
 */
export function requestOrigin(request: Pick<Request, "url">) {
  if (process.env.NODE_ENV === "production") return SITE_URL;
  return new URL(request.url).origin;
}
