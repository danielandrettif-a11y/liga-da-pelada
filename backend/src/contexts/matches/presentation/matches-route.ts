import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  addFinishedGoalEvent,
  addMatchExtraTime,
  changeMatchGoalkeeper,
  correctFinishedGoal,
  correctFinishedGoalEvent,
  createMatch,
  deleteEvent,
  deleteMatch,
  dispatchMatchTimerThreshold,
  findLiveMatchForTeams,
  finishMatch,
  getFinishedMatchAudit,
  getMatch,
  notifyMatchTimerThreshold,
  resetMatchTimer,
  selectBestGoalkeeper,
  setRoundTeamFixedGoalkeeper,
  substituteMatchPlayer,
  undoLastMatchSubstitution,
  updateMatchTimer,
  type CreateMatchInput,
  type MatchRepository,
  type MatchTimerScheduler,
  type SubstituteMatchPlayerInput,
} from "../application/manage-matches.js";
import { MatchNotFoundError, MatchValidationError, parseMatchUuid, validateTimerThreshold } from "../domain/match.js";
import { MatchPersistenceError } from "../infrastructure/pg-match-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof MatchValidationError) {
    return reply.code(400).send({ code: "INVALID_MATCH_REQUEST", message: error.message });
  }
  if (error instanceof MatchNotFoundError) {
    return reply.code(404).send({ code: "MATCH_NOT_FOUND", message: error.message });
  }
  if (error instanceof MatchPersistenceError) {
    return reply.code(error.statusCode).send({ code: "MATCH_PERSISTENCE_ERROR", message: error.message });
  }
  request.log.error({ err: error }, "match operation failed");
  return reply.code(500).send({ code: "MATCH_SERVER_ERROR", message: "Erro no servidor de partidas." });
}

export function registerMatchRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: MatchRepository;
  timerScheduler: MatchTimerScheduler;
  webhookSecret?: string;
}): void {
  // Busca partida por ID
  app.get<{ Params: { leagueId: string; matchId: string } }>(
    "/api/matches/leagues/:leagueId/:matchId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const match = await getMatch(request.params.matchId, request.params.leagueId, authentication.actor, dependencies.repository);
        if (!match) return reply.code(404).send({ code: "MATCH_NOT_FOUND", message: "Partida não encontrada." });
        return reply.code(200).send(match);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Busca partida ao vivo para dois times
  app.get<{ Params: { leagueId: string }; Querystring: { roundId: string; teamAId: string; teamBId: string } }>(
    "/api/matches/leagues/:leagueId/live",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const matchId = await findLiveMatchForTeams(
          request.query.roundId,
          request.query.teamAId,
          request.query.teamBId,
          request.params.leagueId,
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(200).send({ matchId });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Auditoria da partida finalizada
  app.get<{ Params: { leagueId: string; matchId: string } }>(
    "/api/matches/leagues/:leagueId/:matchId/audit",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const audit = await getFinishedMatchAudit(request.params.matchId, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(audit);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Criação de partida
  app.post<{ Params: { leagueId: string }; Body: CreateMatchInput }>(
    "/api/matches/leagues/:leagueId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await createMatch(request.body, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(201).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Encerramento de partida
  app.post<{ Params: { leagueId: string; matchId: string } }>(
    "/api/matches/leagues/:leagueId/:matchId/finish",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await finishMatch(request.params.matchId, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Exclusão de partida
  app.delete<{ Params: { leagueId: string; matchId: string } }>(
    "/api/matches/leagues/:leagueId/:matchId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await deleteMatch(request.params.matchId, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Exclusão de evento
  app.delete<{ Params: { leagueId: string; matchId: string; eventId: string } }>(
    "/api/matches/leagues/:leagueId/:matchId/events/:eventId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await deleteEvent(request.params.eventId, request.params.matchId, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Correção de gol (remoção)
  app.post<{ Params: { leagueId: string; eventId: string }; Body: { confirmation: string } }>(
    "/api/matches/leagues/:leagueId/events/:eventId/correct-goal",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await correctFinishedGoal(request.params.eventId, request.body.confirmation, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Correção de autoria de gol
  app.patch<{ Params: { leagueId: string; eventId: string }; Body: { playerId: string; assistPlayerId: string | null; confirmation: string } }>(
    "/api/matches/leagues/:leagueId/events/:eventId/correct-goal-event",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await correctFinishedGoalEvent(
          request.params.eventId,
          request.body.playerId,
          request.body.assistPlayerId,
          request.body.confirmation,
          request.params.leagueId,
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Adição retroativa de gol
  app.post<{ Params: { leagueId: string; matchId: string }; Body: { teamId: string; playerId: string; assistPlayerId: string | null; confirmation: string } }>(
    "/api/matches/leagues/:leagueId/:matchId/events/add-goal",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await addFinishedGoalEvent(
          request.params.matchId,
          request.body.teamId,
          request.body.playerId,
          request.body.assistPlayerId,
          request.body.confirmation,
          request.params.leagueId,
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(201).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Troca de goleiro ao vivo
  app.patch<{ Params: { leagueId: string; matchId: string; teamId: string }; Body: { playerId: string; elapsedSeconds?: number } }>(
    "/api/matches/leagues/:leagueId/:matchId/teams/:teamId/goalkeeper",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await changeMatchGoalkeeper(
          request.params.matchId,
          request.params.teamId,
          request.body.playerId,
          request.body.elapsedSeconds,
          request.params.leagueId,
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Definição de goleiro fixo do time
  app.patch<{ Params: { leagueId: string; roundId: string; teamId: string }; Body: { playerId: string | null } }>(
    "/api/matches/leagues/:leagueId/rounds/:roundId/teams/:teamId/fixed-goalkeeper",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await setRoundTeamFixedGoalkeeper(
          request.params.roundId,
          request.params.teamId,
          request.body.playerId,
          request.params.leagueId,
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Substituição de jogador ao vivo
  app.post<{ Params: { leagueId: string }; Body: SubstituteMatchPlayerInput }>(
    "/api/matches/leagues/:leagueId/substitutions",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await substituteMatchPlayer(request.body, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(201).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Desfazer substituição
  app.delete<{ Params: { leagueId: string; matchId: string; substitutionId: string } }>(
    "/api/matches/leagues/:leagueId/:matchId/substitutions/:substitutionId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await undoLastMatchSubstitution(request.params.substitutionId, request.params.matchId, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Atualização do cronômetro (start / pause)
  app.patch<{ Params: { leagueId: string; matchId: string }; Body: { action: string } }>(
    "/api/matches/leagues/:leagueId/:matchId/timer",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await updateMatchTimer(
          request.params.matchId, request.body.action, request.params.leagueId,
          authentication.actor, dependencies.repository, dependencies.timerScheduler,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Reset do cronômetro
  app.post<{ Params: { leagueId: string; matchId: string } }>(
    "/api/matches/leagues/:leagueId/:matchId/timer/reset",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await resetMatchTimer(request.params.matchId, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Adição de acréscimo
  app.post<{ Params: { leagueId: string; matchId: string }; Body: { extraSeconds: number } }>(
    "/api/matches/leagues/:leagueId/:matchId/timer/extra-time",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await addMatchExtraTime(
          request.params.matchId, request.body.extraSeconds, request.params.leagueId,
          authentication.actor, dependencies.repository, dependencies.timerScheduler,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Notificação de marco do cronômetro
  app.post<{ Params: { leagueId: string; matchId: string }; Body: { threshold: string } }>(
    "/api/matches/leagues/:leagueId/:matchId/timer/notify",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await notifyMatchTimerThreshold(request.params.matchId, request.body.threshold, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.delete<{ Params: { leagueId: string; matchId: string }; Body: { threshold: string; claimedAt: string } }>(
    "/api/matches/leagues/:leagueId/:matchId/timer/notify",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const threshold = validateTimerThreshold(request.body.threshold);
        if (!request.body.claimedAt || !Number.isFinite(Date.parse(request.body.claimedAt))) {
          throw new MatchValidationError("Identificador da tentativa de alerta inválido.");
        }
        await dependencies.repository.releaseMatchTimerThreshold(
          parseMatchUuid(request.params.matchId, "Partida"), threshold, request.body.claimedAt,
          parseMatchUuid(request.params.leagueId, "Pelada"), authentication.actor,
        );
        return reply.code(204).send();
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Dispatch de marco do cronômetro
  app.post<{ Params: { leagueId: string; matchId: string }; Body: { threshold: string } }>(
    "/api/matches/leagues/:leagueId/:matchId/timer/dispatch",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await dispatchMatchTimerThreshold(request.params.matchId, request.body.threshold, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post<{ Params: { matchId: string }; Body: { threshold: string } }>(
    "/api/internal/matches/:matchId/timer/dispatch",
    async (request, reply) => {
      if (!dependencies.webhookSecret || request.headers.authorization !== `Bearer ${dependencies.webhookSecret}`) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Não autorizado." });
      }
      try {
        const result = await dependencies.repository.dispatchMatchTimerThresholdSystem(
          parseMatchUuid(request.params.matchId, "Partida"),
          validateTimerThreshold(request.body.threshold),
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.delete<{ Params: { matchId: string }; Body: { threshold: string; claimedAt: string } }>(
    "/api/internal/matches/:matchId/timer/dispatch",
    async (request, reply) => {
      if (!dependencies.webhookSecret || request.headers.authorization !== `Bearer ${dependencies.webhookSecret}`) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Não autorizado." });
      }
      try {
        const threshold = validateTimerThreshold(request.body.threshold);
        if (!request.body.claimedAt || !Number.isFinite(Date.parse(request.body.claimedAt))) {
          throw new MatchValidationError("Identificador da tentativa de alerta inválido.");
        }
        await dependencies.repository.releaseMatchTimerThresholdSystem(
          parseMatchUuid(request.params.matchId, "Partida"), threshold, request.body.claimedAt,
        );
        return reply.code(204).send();
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Compatibilidade com prêmio de melhor goleiro (removido)
  app.post<{ Params: { leagueId: string; roundId: string }; Body: { playerId: string } }>(
    "/api/matches/leagues/:leagueId/rounds/:roundId/goalkeeper/best",
    async (request, reply) => {
      const result = selectBestGoalkeeper(request.params.roundId, request.body.playerId);
      return reply.code(200).send(result);
    },
  );
}
