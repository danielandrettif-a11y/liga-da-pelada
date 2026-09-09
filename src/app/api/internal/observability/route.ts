import { NextRequest, NextResponse } from "next/server";
import { reportServerEvent } from "@/lib/observability";

export const dynamic = "force-dynamic";

const ALLOWED_KINDS = new Set(["client_error", "web_vital"]);
const ALLOWED_VITALS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8_192) return NextResponse.json({ ok: false }, { status: 413 });

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const kind = String(body.kind || "");
  const name = String(body.name || "");
  if (!ALLOWED_KINDS.has(kind) || !name || (kind === "web_vital" && !ALLOWED_VITALS.has(name))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await reportServerEvent({
    kind: kind as "client_error" | "web_vital",
    name,
    message: typeof body.message === "string" ? body.message : undefined,
    path: typeof body.path === "string" ? body.path : undefined,
    value: typeof body.value === "number" && Number.isFinite(body.value) ? body.value : undefined,
    rating: typeof body.rating === "string" ? body.rating : undefined,
    metadata: typeof body.metadata === "object" && body.metadata !== null
      ? body.metadata as Record<string, string | number | boolean | null>
      : undefined,
  });

  return new NextResponse(null, { status: 204 });
}
