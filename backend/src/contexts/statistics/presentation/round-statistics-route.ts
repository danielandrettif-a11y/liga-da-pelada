import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  ManageRoundStatisticsUseCase,
  RoundStatisticsValidationError,
  type RoundStatisticsRepository,
} from "../application/manage-round-statistics.js";
import { RoundStatisticsPersistenceError } from "../infrastructure/pg-round-statistics-repository.js";

function failure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof RoundStatisticsValidationError) {
    return reply.code(400).send({ success: false, error: error.message });
  }
  if (error instanceof RoundStatisticsPersistenceError) {
    return reply.code(error.statusCode).send({ success: false, error: error.message });
  }
  request.log.error({ err: error }, "round statistics operation failed");
  return reply.code(500).send({ success: false, error: error instanceof Error ? error.message : "Erro no servidor de estatísticas." });
}

export function registerRoundStatisticsRoutes(
  app: FastifyInstance,
  dependencies: { verifier: UserVerifier; repository: RoundStatisticsRepository },
) {
  const useCase = new ManageRoundStatisticsUseCase(dependencies.repository);

  app.post<{ Params: { leagueId: string; roundId: string } }>(
    "/api/statistics/leagues/:leagueId/rounds/:roundId/recalculate",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        return reply.code(200).send(await useCase.calculateRoundStats(
          auth.actor, request.params.leagueId, request.params.roundId,
        ));
      } catch (error) {
        return failure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/statistics/leagues/:leagueId/rounds/:roundId",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await useCase.getRoundStatistics(auth.actor, request.params.leagueId, request.params.roundId);
        return result ? reply.code(200).send(result) : reply.code(404).send(null);
      } catch (error) {
        return failure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { leagueId: string } }>(
    "/api/statistics/leagues/:leagueId/friendlies",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        return reply.code(200).send(await useCase.getFriendlyStats(auth.actor, request.params.leagueId));
      } catch (error) {
        return failure(error, request, reply);
      }
    },
  );
}
