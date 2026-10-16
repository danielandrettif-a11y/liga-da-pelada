import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ENTRY_FLOW_DONE_COOKIE,
  ENTRY_FLOW_PENDING_COOKIE,
  safeEntryDestination,
} from "@/lib/entry-flow";
import { requestOrigin } from "@/lib/siteUrl";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = safeEntryDestination(url.searchParams.get("next"));
  const client = await createClient();
  await client.auth.signOut({ scope: "local" });

  const response = NextResponse.redirect(new URL("/inicio?apresentacao=1", requestOrigin(request)));
  response.cookies.set(ENTRY_FLOW_PENDING_COOKIE, destination, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  response.cookies.set(ENTRY_FLOW_DONE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
