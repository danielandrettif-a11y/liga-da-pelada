import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  ManageSeasonRankingUseCase,
  type SeasonRankingRepository,
} from "../application/manage-season-ranking.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, "season ranking operation failed");
  return reply.code(500).send({
    code: "STATISTICS_SERVER_ERROR",
    message: (error as Error)?.message || "Erro no servidor de estatísticas.",
  });
}

export function registerSeasonRankingRoutes(
  app: FastifyInstance,
  dependencies: {
    verifier: UserVerifier;
    repository: SeasonRankingRepository;
  },
): void {
  const useCase = new ManageSeasonRankingUseCase(dependencies.repository);

  // 1. Obter Ranking Geral (Lista de RankingEntry)
  app.get<{ Params: { leagueId: string } }>(
    "/api/statistics/leagues/:leagueId/ranking",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);

      try {
        const result = await useCase.getGeneralRanking(authentication.actor, request.params.leagueId);
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // 2. Obter Experiência de Ranking Completa (general, monthly, latestRound)
  app.get<{
    Params: { leagueId: string };
    Querystring: { includeEnrichment?: string };
  }>("/api/statistics/leagues/:leagueId/ranking/experience", async (request, reply) => {
    const authentication = await authenticateBearer(request, dependencies.verifier);
    if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);

    const includeEnrichment = request.query.includeEnrichment !== "false";
    try {
      const result = await useCase.getSeasonRankingExperience(authentication.actor, request.params.leagueId, {
        includeEnrichment,
      });
      return reply.code(200).send(result);
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });

  // 3. Obter Entrada de Ranking de um Atleta Específico
  app.get<{ Params: { leagueId: string; playerId: string } }>(
    "/api/statistics/leagues/:leagueId/ranking/players/:playerId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);

      try {
        const result = await useCase.getPlayerRankingEntry(
          authentication.actor,
          request.params.leagueId,
          request.params.playerId,
        );
        if (!result) {
          return reply.code(404).send({ code: "PLAYER_NOT_FOUND", message: "Jogador não encontrado no ranking." });
        }
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // 4. Obter Enriquecimento em Lote para Atletas
  app.post<{
    Params: { leagueId: string };
    Body: { playerIds: string[] };
  }>("/api/statistics/leagues/:leagueId/ranking/enrichment", async (request, reply) => {
    const authentication = await authenticateBearer(request, dependencies.verifier);
    if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);

    const playerIds = Array.isArray(request.body?.playerIds) ? request.body.playerIds : [];
    try {
      const result = await useCase.getRankingEnrichmentForPlayers(
        authentication.actor,
        request.params.leagueId,
        playerIds,
      );
      return reply.code(200).send(result);
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });
}

