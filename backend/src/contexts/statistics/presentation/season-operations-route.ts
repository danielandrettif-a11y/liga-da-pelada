import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  ManageSeasonOperationsUseCase,
  SeasonOperationsValidationError,
  type SeasonOperationsRepository,
} from "../application/manage-season-operations.js";
import { SeasonOperationsPersistenceError } from "../infrastructure/pg-season-operations-repository.js";

function failure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof SeasonOperationsValidationError) return reply.code(400).send({ success: false, error: error.message });
  if (error instanceof SeasonOperationsPersistenceError) return reply.code(error.statusCode).send({ success: false, error: error.message });
  request.log.error({ err: error }, "season statistics operation failed");
  return reply.code(500).send({ success: false, error: error instanceof Error ? error.message : "Erro no servidor de estatísticas." });
}

export function registerSeasonOperationsRoutes(
  app: FastifyInstance,
  dependencies: { verifier: UserVerifier; repository: SeasonOperationsRepository },
) {
  const useCase = new ManageSeasonOperationsUseCase(dependencies.repository);
  const authenticated = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await authenticateBearer(request, dependencies.verifier);
    if ("error" in result) {
      reply.code(result.error.statusCode).send(result.error);
      return null;
    }
    return result.actor;
  };

  app.get<{ Params: { leagueId: string } }>("/api/statistics/leagues/:leagueId/player-card-overalls", async (request, reply) => {
    const actor = await authenticated(request, reply);
    if (!actor) return;
    try { return reply.code(200).send(await useCase.getPlayerCardOveralls(actor, request.params.leagueId)); }
    catch (error) { return failure(error, request, reply); }
  });

  app.get<{ Params: { leagueId: string } }>("/api/statistics/leagues/:leagueId/team-standings", async (request, reply) => {
    const actor = await authenticated(request, reply);
    if (!actor) return;
    try { return reply.code(200).send(await useCase.getTeamStandings(actor, request.params.leagueId)); }
    catch (error) { return failure(error, request, reply); }
  });

  app.get<{ Params: { leagueId: string } }>("/api/statistics/leagues/:leagueId/reprocess/preview", async (request, reply) => {
    const actor = await authenticated(request, reply);
    if (!actor) return;
    try { return reply.code(200).send(await useCase.previewReprocessSeason(actor, request.params.leagueId)); }
    catch (error) { return failure(error, request, reply); }
  });

  app.post<{ Params: { leagueId: string } }>("/api/statistics/leagues/:leagueId/reprocess", async (request, reply) => {
    const actor = await authenticated(request, reply);
    if (!actor) return;
    try { return reply.code(200).send(await useCase.executeReprocessSeason(actor, request.params.leagueId)); }
    catch (error) { return failure(error, request, reply); }
  });
}
