import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  addPlayerToCallup,
  closeCallup,
  createCallupPrelist,
  inviteGuestListToCallup,
  inviteGuestToCallup,
  joinCallup,
  leaveCallup,
  listActiveCallups,
  listAgendaCallups,
  lockCallup,
  openCallup,
  removePlayerFromCallup,
  repairMyPlayerAccount,
  setCallupVisibility,
  updateCallup,
  type CallupRepository,
} from "../application/manage-callups.js";
import { InvalidCallupError } from "../domain/callup.js";
import { CallupPersistenceError } from "../infrastructure/pg-callup-repository.js";

const leagueParams = {
  type: "object",
  required: ["leagueId"],
  properties: { leagueId: { type: "string" } },
} as const;

const callupParams = {
  type: "object",
  required: ["leagueId", "callupId"],
  properties: {
    leagueId: { type: "string" },
    callupId: { type: "string" },
  },
} as const;

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidCallupError) {
    return reply.code(400).send({ code: "INVALID_CALLUP_REQUEST", message: error.message });
  }
  if (error instanceof CallupPersistenceError) {
    return reply.code(error.statusCode).send({ code: "CALLUP_PERSISTENCE_ERROR", message: error.message });
  }
  request.log.error({ err: error }, "callup operation failed");
  return reply.code(500).send({ code: "CALLUP_SERVER_ERROR", message: "Erro no servidor de convocações." });
}

export function registerCallupRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: CallupRepository;
}): void {
  // Lista convocações ativas
  app.get<{ Params: { leagueId: string }; Querystring: { inviteCallupId?: string } }>(
    "/api/callups/leagues/:leagueId/active",
    { schema: { params: leagueParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      const actor = "error" in authentication ? { userId: "anonymous" } : authentication.actor;
      try {
        const callups = await listActiveCallups(
          request.params.leagueId,
          actor,
          dependencies.repository,
          request.query.inviteCallupId,
        );
        return reply.code(200).send(callups);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Lista agenda
  app.get<{ Params: { leagueId: string } }>(
    "/api/callups/leagues/:leagueId/agenda",
    { schema: { params: leagueParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const agenda = await listAgendaCallups(request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(agenda);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Abrir convocação
  app.post<{
    Params: { leagueId: string };
    Body: {
      date: string;
      startTime?: string | null;
      stadiumId?: string | null;
      roundType?: "friendly" | "official";
      playersPerTeam?: number | null;
      teamsPerRound?: number | null;
    };
  }>(
    "/api/callups/leagues/:leagueId",
    { schema: { params: leagueParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await openCallup(request.params.leagueId, request.body, authentication.actor, dependencies.repository);
        return reply.code(201).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Atualizar convocação
  app.patch<{
    Params: { leagueId: string; callupId: string };
    Body: {
      date: string;
      startTime?: string | null;
      stadiumId?: string | null;
      roundType?: "friendly" | "official";
    };
  }>(
    "/api/callups/leagues/:leagueId/:callupId",
    { schema: { params: callupParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await updateCallup(request.params.leagueId, request.params.callupId, request.body, authentication.actor, dependencies.repository);
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Encerrar convocação
  app.post<{ Params: { leagueId: string; callupId: string } }>(
    "/api/callups/leagues/:leagueId/:callupId/close",
    { schema: { params: callupParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await closeCallup(request.params.leagueId, request.params.callupId, authentication.actor, dependencies.repository);
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Alterar visibilidade
  app.patch<{ Params: { leagueId: string; callupId: string }; Body: { isPublic: boolean } }>(
    "/api/callups/leagues/:leagueId/:callupId/visibility",
    { schema: { params: callupParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await setCallupVisibility(request.params.leagueId, request.params.callupId, Boolean(request.body.isPublic), authentication.actor, dependencies.repository);
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Trancar convocação
  app.post<{ Params: { leagueId: string; callupId: string } }>(
    "/api/callups/leagues/:leagueId/:callupId/lock",
    { schema: { params: callupParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await lockCallup(request.params.leagueId, request.params.callupId, authentication.actor, dependencies.repository);
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Entrar na lista
  app.post<{ Params: { leagueId: string; callupId: string } }>(
    "/api/callups/leagues/:leagueId/:callupId/join",
    { schema: { params: callupParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await joinCallup(request.params.leagueId, request.params.callupId, authentication.actor, dependencies.repository);
        return reply.code(200).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Desistir da lista
  app.post<{ Params: { leagueId: string; callupId: string } }>(
    "/api/callups/leagues/:leagueId/:callupId/leave",
    { schema: { params: callupParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await leaveCallup(request.params.leagueId, request.params.callupId, authentication.actor, dependencies.repository);
        return reply.code(200).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Adicionar jogador
  app.post<{
    Params: { leagueId: string; callupId: string };
    Body: { playerId: string; asAdmin?: boolean };
  }>(
    "/api/callups/leagues/:leagueId/:callupId/players",
    { schema: { params: callupParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await addPlayerToCallup(
          request.params.leagueId,
          request.params.callupId,
          request.body.playerId,
          Boolean(request.body.asAdmin),
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(200).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Remover jogador
  app.delete<{
    Params: { leagueId: string; callupId: string; playerId: string };
    Querystring: { asAdmin?: string };
  }>(
    "/api/callups/leagues/:leagueId/:callupId/players/:playerId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const asAdmin = request.query.asAdmin === "true";
        const result = await removePlayerFromCallup(
          request.params.leagueId,
          request.params.callupId,
          request.params.playerId,
          asAdmin,
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(200).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Convidar amigo
  app.post<{
    Params: { leagueId: string; callupId: string };
    Body: { name: string; playerProfile?: string; isGoalkeeper?: boolean };
  }>(
    "/api/callups/leagues/:leagueId/:callupId/guests",
    { schema: { params: callupParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await inviteGuestToCallup(
          request.params.leagueId,
          request.params.callupId,
          request.body,
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(201).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Convidar lista de amigos
  app.post<{
    Params: { leagueId: string; callupId: string };
    Body: { guests: Array<{ name: string; isGoalkeeper?: boolean }>; playerProfile: string };
  }>(
    "/api/callups/leagues/:leagueId/:callupId/guest-list",
    { schema: { params: callupParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await inviteGuestListToCallup(
          request.params.leagueId,
          request.params.callupId,
          request.body.guests || [],
          request.body.playerProfile || "midfield",
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(200).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Criar pré-lista
  app.post<{ Params: { leagueId: string; callupId: string } }>(
    "/api/callups/leagues/:leagueId/:callupId/prelist",
    { schema: { params: callupParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await createCallupPrelist(
          request.params.leagueId,
          request.params.callupId,
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(201).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Reparar conta do jogador
  app.post(
    "/api/callups/repair-player",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await repairMyPlayerAccount(authentication.actor, dependencies.repository);
        return reply.code(200).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
