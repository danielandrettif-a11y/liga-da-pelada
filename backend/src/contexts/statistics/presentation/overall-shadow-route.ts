import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  createManageOverallShadowService,
  type OverallShadowRepository,
} from "../application/manage-overall-shadow.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, "overall shadow operation failed");
  return reply.code(500).send({
    code: "STATISTICS_SERVER_ERROR",
    message: (error as Error)?.message || "Erro no servidor de estatísticas.",
  });
}

export function registerOverallShadowRoutes(
  app: FastifyInstance,
  dependencies: {
    verifier: UserVerifier;
    repository: OverallShadowRepository;
    calculationEngine?: {
      parseFormulaConfig: (config: any) => any;
      calculateOveralls: (players: any[], rounds: any[], config: any) => { snapshots: any[]; breakdowns: any[] };
    };
  },
): void {
  const service = createManageOverallShadowService(
    dependencies.repository,
    dependencies.calculationEngine,
  );

  // 1. Obter dados sombra de administração
  app.get<{ Params: { leagueId: string } }>(
    "/api/statistics/leagues/:leagueId/overall/shadow",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send(authentication.error);
      }

      try {
        const result = await service.getOverallShadowAdminData(
          authentication.actor,
          request.params.leagueId,
        );
        return reply.code(200).send({ success: true, data: result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // 2. Recalcular rascunho de OVR sombra
  app.post<{ Params: { leagueId: string } }>(
    "/api/statistics/leagues/:leagueId/overall/shadow/recalculate",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send(authentication.error);
      }

      try {
        const result = await service.recalculateOverallShadow(
          authentication.actor,
          request.params.leagueId,
        );
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // 3. Publicar rascunho de OVR sombra
  app.post<{ Params: { leagueId: string }; Body: { runId: string } }>(
    "/api/statistics/leagues/:leagueId/overall/shadow/publish",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send(authentication.error);
      }

      try {
        const runId = request.body?.runId;
        if (!runId) {
          return reply.code(400).send({ success: false, error: "ID da execução é obrigatório." });
        }
        const result = await service.publishOverallShadow(
          authentication.actor,
          request.params.leagueId,
          runId,
        );
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // 4. Recalcular e publicar OVR fluido
  app.post<{ Params: { leagueId: string } }>(
    "/api/statistics/leagues/:leagueId/overall/fluid/recalculate-and-publish",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send(authentication.error);
      }

      try {
        const result = await service.recalculateAndPublishFluidOverall(
          authentication.actor,
          request.params.leagueId,
        );
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // 5. Atualizar OVR fluido com segurança (tolerante a falhas)
  app.post<{ Params: { leagueId: string }; Body: { reason?: string } }>(
    "/api/statistics/leagues/:leagueId/overall/fluid/refresh",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send(authentication.error);
      }

      try {
        const reason = request.body?.reason || "rotina";
        const result = await service.refreshFluidOverallSafely(
          authentication.actor,
          request.params.leagueId,
          reason,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
