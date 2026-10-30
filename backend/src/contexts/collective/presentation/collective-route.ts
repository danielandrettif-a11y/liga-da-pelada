import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  ManageCollectiveUseCase,
  type CollectiveRepository,
} from "../application/manage-collective.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, "collective operation failed");
  const message = error instanceof Error ? error.message : "Erro interno no serviço da Coletiva.";
  return reply.code(500).send({ success: false, error: message });
}

export function registerCollectiveRoutes(
  app: FastifyInstance,
  options: {
    repository: CollectiveRepository;
    userVerifier: UserVerifier;
  }
) {
  const useCase = new ManageCollectiveUseCase(options.repository);

  // 1. Resumo Ativo
  app.get<{ Params: { leagueId: string } }>(
    "/api/collective/leagues/:leagueId/summary",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      try {
        const summary = await useCase.getActiveSummary(auth.actor, request.params.leagueId);
        return reply.code(200).send(summary);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 2. Sala da Coletiva
  app.get<{ Params: { leagueId: string }; Querystring: { callupId?: string } }>(
    "/api/collective/leagues/:leagueId/room",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      try {
        const room = await useCase.getRoom(auth.actor, request.params.leagueId, request.query.callupId);
        return reply.code(200).send(room);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 3. Mensagens Anteriores
  app.post<{ Params: { leagueId: string; callupId: string }; Body: { cursor: any } }>(
    "/api/collective/leagues/:leagueId/callups/:callupId/messages",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      try {
        const res = await useCase.getOlderMessages(
          auth.actor,
          request.params.leagueId,
          request.params.callupId,
          request.body?.cursor
        );
        return reply.code(res.success ? 200 : 400).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 4. Enviar Mensagem
  app.post<{ Params: { leagueId: string }; Body: any }>(
    "/api/collective/leagues/:leagueId/messages",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      try {
        const payload = (request.body || {}) as any;
        const res = await useCase.sendMessage(auth.actor, request.params.leagueId, payload);
        return reply.code(res.success ? 200 : 400).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 5. Editar Mensagem
  app.patch<{ Params: { leagueId: string; messageId: string }; Body: { body: string } }>(
    "/api/collective/leagues/:leagueId/messages/:messageId",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      try {
        const res = await useCase.editMessage(
          auth.actor,
          request.params.leagueId,
          request.params.messageId,
          request.body?.body || ""
        );
        return reply.code(res.success ? 200 : 400).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 6. Apagar Mensagem
  app.delete<{ Params: { leagueId: string; messageId: string } }>(
    "/api/collective/leagues/:leagueId/messages/:messageId",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      try {
        const res = await useCase.deleteMessage(
          auth.actor,
          request.params.leagueId,
          request.params.messageId
        );
        return reply.code(res.success ? 200 : 400).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 7. Marcar como Lida
  app.post<{ Params: { leagueId: string }; Body: { targets: Array<{ callupId: string; messageId: string }> } }>(
    "/api/collective/leagues/:leagueId/reads",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      try {
        const res = await useCase.markRead(
          auth.actor,
          request.params.leagueId,
          request.body?.targets || []
        );
        return reply.code(200).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 8. Coletiva Anterior (Admin)
  app.get<{ Params: { leagueId: string } }>(
    "/api/collective/leagues/:leagueId/admin-previous",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      try {
        const res = await useCase.getAdminPreviousCollective(auth.actor, request.params.leagueId);
        return reply.code(200).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );
}
