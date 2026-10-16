import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/siteUrl";
import { cookies } from "next/headers";
import { ENTRY_FLOW_PENDING_COOKIE } from "@/lib/entry-flow";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const safeNext = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : null;

  if (code) {
    const client = await createClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const { error: profileRepairError } = await client.rpc("ensure_my_player_account");
      if (profileRepairError) console.error("Erro ao concluir perfil após autenticação:", profileRepairError);
      const entryFlowPending = Boolean((await cookies()).get(ENTRY_FLOW_PENDING_COOKIE)?.value);
      const destination = entryFlowPending ? "/inicio?apresentacao=1" : safeNext || "/lobby";
      return NextResponse.redirect(new URL(destination, SITE_URL));
    }
  }

  return NextResponse.redirect(new URL("/login", SITE_URL));
}
