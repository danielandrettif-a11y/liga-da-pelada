import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  getInboxPreview,
  markInboxRead,
  syncAndListInbox,
  type InboxRepository,
} from "../application/manage-inbox.js";
import {
  InvalidNotificationError,
  type DesiredInboxNotification,
} from "../domain/inbox-notification.js";
import { NotificationPersistenceError } from "../infrastructure/pg-inbox-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidNotificationError) {
    return reply.code(400).send({ code: "INVALID_NOTIFICATION_REQUEST", message: error.message });
  }
  if (error instanceof NotificationPersistenceError) {
    return reply.code(error.statusCode).send({ code: "NOTIFICATION_PERSISTENCE_ERROR", message: error.message });
  }
  request.log.error({ err: error }, "notification operation failed");
  return reply.code(500).send({ code: "NOTIFICATION_SERVER_ERROR", message: "Erro no servidor de notificações." });
}

export function registerInboxRoutes(
  app: FastifyInstance,
  dependencies: {
    verifier: UserVerifier;
    repository: InboxRepository;
  },
): void {
  // Prévia do Inbox (usado no sino do layout global)
  app.get("/api/notifications/inbox/preview", async (request, reply) => {
    const authentication = await authenticateBearer(request, dependencies.verifier);
    if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
    try {
      const preview = await getInboxPreview(authentication.actor, dependencies.repository);
      return reply.code(200).send(preview);
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });

  // Marcação de notificações como lidas/resolvidas
  app.post<{ Body: { ids?: string[] } }>("/api/notifications/inbox/read", async (request, reply) => {
    const authentication = await authenticateBearer(request, dependencies.verifier);
    if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
    try {
      const result = await markInboxRead(
        authentication.actor,
        dependencies.repository,
        request.body?.ids,
      );
      return reply.code(200).send(result);
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });

  // Sincronização e listagem das notificações do usuário
  app.post<{ Body: { leagueId: string; desired: DesiredInboxNotification[] } }>(
    "/api/notifications/inbox/sync",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const { leagueId, desired } = request.body || {};
        const items = await syncAndListInbox(
          authentication.actor,
          leagueId,
          desired || [],
          dependencies.repository,
        );
        return reply.code(200).send(items);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}

