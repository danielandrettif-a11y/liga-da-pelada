import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import type { DeliveryApplicationService } from "../application/manage-delivery.js";
import { NotificationDeliveryError } from "../application/manage-delivery.js";
import { NotificationPersistenceError } from "../infrastructure/pg-inbox-repository.js";
import { parseMatchUuid, validateTimerThreshold } from "../../matches/domain/match.js";

type DeliveryRouteDependencies = {
  verifier: UserVerifier;
  deliveryService: DeliveryApplicationService;
  webhookSecret?: string;
};

export function registerDeliveryRoutes(
  app: FastifyInstance,
  { verifier, deliveryService, webhookSecret }: DeliveryRouteDependencies,
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

  app.post("/api/notifications/test-push", async (request, reply) => {
    const auth = await authenticateBearer(request, verifier);
    if ("error" in auth) {
      return reply.status(auth.error.statusCode).send({ success: false, error: auth.error.message });
    }

    try {
      const result = await deliveryService.schedulePushTest({ userId: auth.actor.userId });
      return reply.status(200).send({ success: true, scheduled: result.scheduled });
    } catch (error) {
      if (error instanceof NotificationDeliveryError) {
        return reply.status(error.statusCode).send({ success: false, error: error.message });
      }
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Falha ao agendar teste de notificação.",
      });
    }
  });

  app.post("/api/notifications/test-cartola-email", async (request, reply) => {
    const auth = await authenticateBearer(request, verifier);
    if ("error" in auth) {
      return reply.status(auth.error.statusCode).send({ success: false, error: auth.error.message });
    }

    const body = (request.body || {}) as { leagueId?: string };
    if (!body.leagueId || typeof body.leagueId !== "string") {
      return reply.status(400).send({ success: false, error: "Pelada inválida." });
    }

    try {
      const result = await deliveryService.sendCartolaEmailTest(body.leagueId, auth.actor);
      return reply.status(200).send({ success: true, testedAt: result.testedAt });
    } catch (error) {
      if (error instanceof NotificationPersistenceError) {
        return reply.status(error.statusCode).send({ success: false, error: error.message });
      }
      if (error instanceof NotificationDeliveryError) {
        return reply.status(error.statusCode).send({ success: false, error: error.message });
      }
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : "Falha ao enviar e-mail de teste.",
      });
    }
  });

  app.post("/api/internal/notifications/push-test-alert", async (request, reply) => {
    if (!authorizeInternalWebhook(request, reply)) return;

    const body = (request.body || {}) as { userId?: unknown };
    if (typeof body.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.userId)) {
      return reply.status(400).send({ error: "Usuário inválido." });
    }

    try {
      const delivery = await deliveryService.deliverPushTestAlert(body.userId);
      if (delivery.disabled) {
        return reply.status(503).send({ error: "As chaves VAPID não estão configuradas." });
      }
      if (delivery.sent === 0) {
        return reply.status(502).send({
          error: delivery.failed > 0
            ? `O provedor recusou a notificação${delivery.failureReasons?.[0] ? `: ${delivery.failureReasons[0]}` : "."}`
            : "Este aparelho não possui assinatura de notificação ativa.",
        });
      }
      return reply.status(200).send({ success: true, sent: delivery.sent });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao entregar o teste.";
      return reply.status(500).send({ error: message });
    }
  });

  app.post("/api/internal/notifications/match-timer-alert", async (request, reply) => {
    if (!authorizeInternalWebhook(request, reply)) return;

    const body = (request.body || {}) as { matchId?: string; threshold?: string };
    try {
      const result = await deliveryService.deliverMatchTimerAlert(
        parseMatchUuid(body.matchId, "Partida"),
        validateTimerThreshold(body.threshold || ""),
      );
      if (result.disabled) {
        return reply.status(503).send({ success: false, error: "As chaves VAPID não estão configuradas." });
      }
      return reply.status(200).send({ success: true, ...result });
    } catch (error) {
      const status = error instanceof NotificationDeliveryError ? error.statusCode : 500;
      return reply.status(status).send({
        success: false,
        error: error instanceof Error ? error.message : "Falha ao entregar alerta do cronômetro.",
      });
    }
  });
}
