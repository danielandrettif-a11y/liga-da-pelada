import { sendPushTestNotification } from "@/lib/push-notifications";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const expectedSecret = process.env.MATCH_TIMER_WEBHOOK_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: { userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corpo inválido." }, { status: 400 });
  }

  if (typeof body.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.userId)) {
    return Response.json({ error: "Usuário inválido." }, { status: 400 });
  }

  const client = createServiceClient();
  if (!client) {
    return Response.json({ error: "Serviço de notificações não configurado." }, { status: 503 });
  }

  try {
    const delivery = await sendPushTestNotification(client, body.userId);
    if (delivery.disabled) {
      return Response.json({ error: "As chaves VAPID não estão configuradas." }, { status: 503 });
    }
    if (delivery.sent === 0) {
      return Response.json({
        error: delivery.failed > 0
          ? `O provedor recusou a notificação${delivery.failureReasons?.[0] ? `: ${delivery.failureReasons[0]}` : "."}`
          : "Este aparelho não possui assinatura de notificação ativa.",
      }, { status: 502 });
    }

    return Response.json({ success: true, sent: delivery.sent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao entregar o teste.";
    return Response.json({ error: message }, { status: 500 });
  }
}
