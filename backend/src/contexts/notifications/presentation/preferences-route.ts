import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  getNotificationPreferences,
  getPushPublicKey,
  getPushSystemStatus,
  subscribeToPush,
  unsubscribeFromPush,
  updateNotificationPreferences,
  type NotificationPreferencesRepository,
  type PushConfigurationProvider,
  type PushSubscriptionRepository,
} from "../application/manage-preferences.js";
import {
  InvalidPushSubscriptionError,
  type SerializedPushSubscription,
} from "../domain/push-subscription.js";
import type { UpdateNotificationPreferencesInput } from "../domain/notification-preferences.js";
import { NotificationPersistenceError } from "../infrastructure/pg-inbox-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidPushSubscriptionError) {
    return reply.code(400).send({ code: "INVALID_PUSH_SUBSCRIPTION", message: error.message });
  }
  if (error instanceof NotificationPersistenceError) {
    return reply.code(error.statusCode).send({ code: "NOTIFICATION_PERSISTENCE_ERROR", message: error.message });
  }
  request.log.error({ err: error }, "preferences or push operation failed");
  return reply.code(500).send({ code: "NOTIFICATION_SERVER_ERROR", message: "Erro no servidor de notificações." });
}

export function registerPreferencesRoutes(
  app: FastifyInstance,
  dependencies: {
    verifier: UserVerifier;
    pushConfig: PushConfigurationProvider;
    pushSubscriptions: PushSubscriptionRepository;
    preferences: NotificationPreferencesRepository;
    emailConfigured: boolean;
  },
): void {
  // Chave pública do Web Push
  app.get("/api/notifications/push/public-key", async (_request, reply) => {
    const result = await getPushPublicKey(dependencies.pushConfig);
    return reply.code(200).send(result);
  });

  // Status de configuração do sistema push
  app.get("/api/notifications/push/status", async (_request, reply) => {
    const result = await getPushSystemStatus(dependencies.pushConfig);
    return reply.code(200).send(result);
  });

  // Cadastrar assinatura push
  app.post<{ Body: SerializedPushSubscription }>(
    "/api/notifications/push/subscribe",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await subscribeToPush(
          authentication.actor,
          request.body,
          dependencies.pushSubscriptions,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Cancelar assinatura push
  app.post<{ Body: { endpoint: string } }>(
    "/api/notifications/push/unsubscribe",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await unsubscribeFromPush(
          authentication.actor,
          request.body?.endpoint,
          dependencies.pushSubscriptions,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Obter preferências de notificação do usuário para a pelada
  app.get<{ Params: { leagueId: string } }>(
    "/api/notifications/preferences/:leagueId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await getNotificationPreferences(
          authentication.actor,
          request.params.leagueId,
          dependencies.preferences,
          dependencies.emailConfigured,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Atualizar preferências de notificação
  app.put<{ Body: UpdateNotificationPreferencesInput }>(
    "/api/notifications/preferences",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await updateNotificationPreferences(
          authentication.actor,
          request.body,
          dependencies.preferences,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}

