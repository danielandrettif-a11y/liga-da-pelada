import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  getMonthlyAwardWinners, getPlayerAchievementBelts, getPlayerMonthlyAwards,
  type PlayerAwardsRepository,
} from "../application/get-player-awards.js";
import { InvalidPlayerCatalogError } from "../domain/player-catalog.js";
import { PlayerAwardsPersistenceError } from "../infrastructure/pg-player-awards-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidPlayerCatalogError || (error instanceof Error && error.message.includes("Período mensal"))) {
    return reply.code(400).send({ code: "INVALID_PLAYER_AWARDS", message: error.message });
  }
  if (error instanceof PlayerAwardsPersistenceError) {
    return reply.code(error.statusCode).send({ code: "PLAYER_AWARDS_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "player awards operation failed");
  return reply.code(503).send({ code: "PLAYER_AWARDS_UNAVAILABLE", message: "Serviço indisponível." });
}

const leagueParams = { type: "object", required: ["leagueId"], properties: {
  leagueId: { type: "string", format: "uuid" },
} } as const;
const playerParams = { type: "object", required: ["leagueId", "playerId"], properties: {
  leagueId: { type: "string", format: "uuid" }, playerId: { type: "string", format: "uuid" },
} } as const;

export function registerPlayerAwardsRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier; repository: PlayerAwardsRepository;
}): void {
  const playerRead = (kind: "monthly" | "belts") => async (
    request: FastifyRequest<{ Params: { leagueId: string; playerId: string } }>, reply: FastifyReply,
  ) => {
    const authentication = await authenticateBearer(request, dependencies.verifier);
    if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
    try {
      return kind === "monthly"
        ? { awards: await getPlayerMonthlyAwards(request.params.leagueId, request.params.playerId,
          authentication.actor, dependencies.repository) }
        : { belts: await getPlayerAchievementBelts(request.params.leagueId, request.params.playerId,
          authentication.actor, dependencies.repository) };
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  };

  app.get<{ Params: { leagueId: string; playerId: string } }>(
    "/api/roster/leagues/:leagueId/players/:playerId/monthly-awards",
    { schema: { params: playerParams } }, playerRead("monthly"),
  );
  app.get<{ Params: { leagueId: string; playerId: string } }>(
    "/api/roster/leagues/:leagueId/players/:playerId/achievement-belts",
    { schema: { params: playerParams } }, playerRead("belts"),
  );
  app.get<{ Params: { leagueId: string }; Querystring: { period_start: string } }>(
    "/api/roster/leagues/:leagueId/monthly-awards/winners",
    { schema: { params: leagueParams, querystring: { type: "object", required: ["period_start"], properties: {
      period_start: { type: "string", pattern: "^\\d{4}-\\d{2}-01$" },
    } } } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { winners: await getMonthlyAwardWinners(request.params.leagueId, request.query.period_start,
          authentication.actor, dependencies.repository) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
