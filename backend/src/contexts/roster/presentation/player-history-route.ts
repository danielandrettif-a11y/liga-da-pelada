import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  getPlayerAwardSeasons, getPlayerRoundHistory, type PlayerHistoryRepository,
} from "../application/get-player-history.js";
import { InvalidPlayerCatalogError } from "../domain/player-catalog.js";
import { PlayerHistoryPersistenceError } from "../infrastructure/pg-player-history-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidPlayerCatalogError || (error instanceof Error && error.message.includes("Tipo de rodada"))) {
    return reply.code(400).send({ code: "INVALID_PLAYER_HISTORY", message: error.message });
  }
  if (error instanceof PlayerHistoryPersistenceError) {
    return reply.code(error.statusCode).send({ code: "PLAYER_HISTORY_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "player history operation failed");
  return reply.code(503).send({ code: "PLAYER_HISTORY_UNAVAILABLE", message: "Serviço indisponível." });
}

const params = { type: "object", required: ["leagueId", "playerId"], properties: {
  leagueId: { type: "string", format: "uuid" }, playerId: { type: "string", format: "uuid" },
} } as const;

export function registerPlayerHistoryRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier; repository: PlayerHistoryRepository;
}): void {
  app.get<{ Params: { leagueId: string; playerId: string }; Querystring: { round_type?: string } }>(
    "/api/roster/leagues/:leagueId/players/:playerId/round-history",
    { schema: { params, querystring: { type: "object", properties: {
      round_type: { type: "string", enum: ["official", "friendly"] },
    } } } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { history: await getPlayerRoundHistory(request.params.leagueId, request.params.playerId,
          request.query.round_type || "official", authentication.actor, dependencies.repository) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
  app.get<{ Params: { leagueId: string; playerId: string } }>(
    "/api/roster/leagues/:leagueId/players/:playerId/award-seasons",
    { schema: { params } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { seasons: await getPlayerAwardSeasons(request.params.leagueId, request.params.playerId,
          authentication.actor, dependencies.repository) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
