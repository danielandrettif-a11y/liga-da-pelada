import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import type {
  CartolaReminderApplicationService,
  CartolaReminderScheduler,
} from "../application/manage-cartola-reminders.js";
import { CartolaReminderError } from "../application/manage-cartola-reminders.js";
import { NotificationPersistenceError } from "../infrastructure/pg-inbox-repository.js";
import type { CartolaReminderJob } from "../domain/cartola-reminder.js";

type CartolaReminderRouteDependencies = {
  verifier: UserVerifier;
  cartolaService: CartolaReminderApplicationService;
  scheduler: CartolaReminderScheduler;
  webhookSecret?: string;
};

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

export function registerCartolaReminderRoutes(
  app: FastifyInstance,
  { verifier, cartolaService, scheduler, webhookSecret }: CartolaReminderRouteDependencies,
) {
  function authorizeInternalWebhook(request: FastifyRequest, reply: FastifyReply): boolean {
    const expected = webhookSecret?.trim();
    const authorization = request.headers.authorization;
    if (!expected || authorization !== `Bearer ${expected}`) {
      reply.status(401).send({ error: "Não autorizado." });
      return false;
    }
    return true;
  }

  app.post("/api/notifications/cartola/reminders/toggle", async (request, reply) => {
    const auth = await authenticateBearer(request, verifier);
    if ("error" in auth) {
      return reply.status(auth.error.statusCode).send({ success: false, error: auth.error.message });
    }

    const body = (request.body || {}) as { leagueId?: string; enabled?: boolean };
    if (!body.leagueId || typeof body.enabled !== "boolean") {
      return reply.status(400).send({ success: false, error: "Parâmetros inválidos." });
    }

    try {
      const result = await cartolaService.toggleReminders(body.leagueId, body.enabled, auth.actor);
      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof NotificationPersistenceError || error instanceof CartolaReminderError) {
        return reply.status(error.statusCode).send({ success: false, error: error.message });
      }
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Erro ao alterar envio geral.",
      });
    }
  });

  app.post("/api/notifications/cartola/reminders/cancel", async (request, reply) => {
    const body = (request.body || {}) as { userId?: string; token?: string };
    if (!body.userId || !body.token) {
      return reply.status(400).send({ success: false, error: "Parâmetros de cancelamento ausentes." });
    }

    try {
      const result = await cartolaService.cancelEmailReminders(body.userId, body.token);
      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof CartolaReminderError) {
        return reply.status(error.statusCode).send({ success: false, error: error.message });
      }
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Erro ao cancelar lembretes.",
      });
    }
  });

  app.post("/api/internal/notifications/cartola-reminder", async (request, reply) => {
    if (!authorizeInternalWebhook(request, reply)) return;

    const body: unknown = request.body;
    if (
      body &&
      typeof body === "object" &&
      ["opening", "12h", "1h"].includes(String((body as { milestone?: unknown }).milestone))
    ) {
      return reply.status(200).send({ skipped: "obsolete-milestone" });
    }

    if (!validJob(body)) {
      return reply.status(400).send({ error: "Payload inválido." });
    }

    const remainingMs = new Date(body.targetAt).getTime() - Date.now();
    if (remainingMs > 15_000) {
      await scheduler.scheduleReminderJob(body);
      return reply.status(200).send({ relayed: true });
    }

    try {
      const result = await cartolaService.dispatchCartolaReminder(body);
      return reply.status(200).send(result);
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Falha ao disparar lembrete do Cartola.",
      });
    }
  });
}

