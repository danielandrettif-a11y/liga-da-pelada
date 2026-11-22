import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/siteUrl";
import { cookies } from "next/headers";
import { ENTRY_FLOW_PENDING_COOKIE, resolveLoginDestination } from "@/lib/entry-flow";
import { identityPublicApi } from "@/modules/identity/infrastructure/identity-api-session";
import { consumeIdentityPkceVerifier } from "@/modules/identity/infrastructure/identity-pkce";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const pkceFlow = url.searchParams.get("pkce_flow");
  const safeNext = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : null;

  if (code) {
    const client = await createClient();
    let api = null;
    try {
      api = identityPublicApi();
    } catch (error) {
      console.error("API de identidade indisponível no callback:", error);
    }
    let authenticated = false;
    if (api && pkceFlow) {
      const verifier = await consumeIdentityPkceVerifier(pkceFlow);
      if (verifier) {
        try {
          const session = await api.exchangePkceCode(code, verifier);
          const { error } = await client.auth.setSession({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
          });
          authenticated = !error;
        } catch (error) {
          console.error("Erro ao concluir autenticação no backend:", error);
        }
      }
    } else {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      authenticated = !error && Boolean(data.user);
      if (authenticated) {
        const { error: profileRepairError } = await client.rpc("ensure_my_player_account");
        if (profileRepairError) console.error("Erro ao concluir perfil após autenticação:", profileRepairError);
      }
    }
    if (authenticated) {
      const entryFlowPending = Boolean((await cookies()).get(ENTRY_FLOW_PENDING_COOKIE)?.value);
      const destination = resolveLoginDestination(safeNext, entryFlowPending);
      return NextResponse.redirect(new URL(destination, SITE_URL));
    }
  }

  return NextResponse.redirect(new URL("/login", SITE_URL));
}
