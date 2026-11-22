import { NextResponse } from "next/server";
import { httpNotificationGateway } from "@/modules/notifications/infrastructure/http-notification-gateway";
import { dispatchCartolaReminder } from "@/lib/cartola-reminders";
import { scheduleCartolaReminderJob, type CartolaReminderJob } from "@/lib/cartola-reminder-scheduler";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.MATCH_TIMER_WEBHOOK_SECRET?.trim().replace(/^['"]|['"]$/g, "");
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function validJob(value: unknown): value is CartolaReminderJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<CartolaReminderJob>;
  return (
    typeof job.roundId === "string" &&
    ["24h", "2h"].includes(String(job.milestone)) &&
    typeof job.targetAt === "string" &&
    Number.isFinite(new Date(job.targetAt).getTime()) &&
    typeof job.roundStartAt === "string" &&
    Number.isFinite(new Date(job.roundStartAt).getTime())
  );
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (
    body &&
    typeof body === "object" &&
    ["opening", "12h", "1h"].includes(String((body as { milestone?: unknown }).milestone))
  ) {
    return NextResponse.json({ skipped: "obsolete-milestone" });
  }
  if (!validJob(body)) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const secret = process.env.MATCH_TIMER_WEBHOOK_SECRET?.trim().replace(/^['"]|['"]$/g, "") || "";
  const backendUrl =
    process.env.NOTIFICATIONS_BACKEND_URL ||
    process.env.INTERNAL_BACKEND_URL ||
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL;

  if (process.env.NOTIFICATIONS_API_ENABLED === "true" && backendUrl) {
    const gateway = httpNotificationGateway(backendUrl);
    try {
      const result = await gateway.relayOrDispatchCartolaReminder(body, secret);
      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao processar lembrete.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const remainingMs = new Date(body.targetAt).getTime() - Date.now();
  if (remainingMs > 15_000) {
    await scheduleCartolaReminderJob(body);
    return NextResponse.json({ relayed: true });
  }
  const result = await dispatchCartolaReminder(body);
  return NextResponse.json(result);
}
