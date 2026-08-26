import { dispatchMatchTimerThreshold } from "@/lib/actions/matches";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TimerAlertRequest = {
  matchId?: unknown;
  threshold?: unknown;
};

export async function POST(request: Request) {
  const expectedSecret = process.env.MATCH_TIMER_WEBHOOK_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: TimerAlertRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corpo inválido." }, { status: 400 });
  }

  if (
    typeof body.matchId !== "string"
    || !/^[0-9a-f-]{36}$/i.test(body.matchId)
    || (body.threshold !== "one_minute" && body.threshold !== "thirty_seconds" && body.threshold !== "finished")
  ) {
    return Response.json({ error: "Alerta inválido." }, { status: 400 });
  }

  const client = createServiceClient();
  if (!client) {
    return Response.json({ error: "Serviço de alertas não configurado." }, { status: 503 });
  }

  const result = await dispatchMatchTimerThreshold(client, body.matchId, body.threshold);
  if (!result.success) {
    return Response.json({ error: result.error || "Falha ao disparar o alerta." }, { status: 500 });
  }
  if (result.skipped && result.reason === "too_early") {
    return Response.json({
      error: `Alerta recebido antes do marco; faltam ${result.secondsLeft} segundos.`,
    }, {
      status: 425,
      headers: { "Retry-After": "1" },
    });
  }

  return Response.json(result);
}
