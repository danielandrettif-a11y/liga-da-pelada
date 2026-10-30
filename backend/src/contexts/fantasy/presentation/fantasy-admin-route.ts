import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  ManageFantasyAdminUseCase,
  type FantasyAdminRepository,
} from "../application/manage-fantasy-admin.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, "fantasy admin operation failed");
  return reply.code(500).send({
    code: "FANTASY_ADMIN_ERROR",
    message: (error as Error)?.message || "Erro no servidor de fantasy admin.",
  });
}

export function registerFantasyAdminRoutes(
  app: FastifyInstance,
  dependencies: {
    verifier: UserVerifier;
    repository: FantasyAdminRepository;
  }
): void {
  const useCase = new ManageFantasyAdminUseCase(dependencies.repository);

  // 1. Ranking do Fantasy
  app.get<{
    Params: { leagueId: string };
    Querystring: { scope?: "general" | "season" | "month" | "round"; roundId?: string };
  }>("/api/fantasy/leagues/:leagueId/ranking", async (request, reply) => {
    const auth = await authenticateBearer(request, dependencies.verifier);
    if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
    try {
      const scope = request.query.scope || "season";
      const ranking = await useCase.getRanking(auth.actor, request.params.leagueId, scope, request.query.roundId);
      return reply.code(200).send(ranking);
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });

  // 2. Histórico do Usuário
  app.get<{ Params: { leagueId: string; userId: string } }>(
    "/api/fantasy/leagues/:leagueId/users/:userId/history",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const history = await useCase.getUserHistory(auth.actor, request.params.leagueId, request.params.userId);
        return reply.code(200).send(history);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 3. Histórico de Rodada do Usuário
  app.get<{ Params: { leagueId: string; userId: string; roundId: string } }>(
    "/api/fantasy/leagues/:leagueId/users/:userId/rounds/:roundId/history",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const detail = await useCase.getUserRoundHistory(
          auth.actor,
          request.params.leagueId,
          request.params.userId,
          request.params.roundId
        );
        if (!detail) {
          return reply.code(404).send({ code: "NOT_FOUND", message: "Histórico da rodada não encontrado." });
        }
        return reply.code(200).send(detail);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 4. Passe de Temporada
  app.get<{ Params: { leagueId: string } }>(
    "/api/fantasy/leagues/:leagueId/season-pass",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const pass = await useCase.getSeasonPassDashboard(auth.actor, request.params.leagueId);
        return reply.code(200).send(pass);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 5. Dados Admin do Cartola
  app.get<{ Params: { leagueId: string } }>(
    "/api/fantasy/leagues/:leagueId/admin-data",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.getAdminData(auth.actor, request.params.leagueId);
        if (!res.success) return reply.code(403).send({ code: "FORBIDDEN", message: res.error });
        return reply.code(200).send(res.data);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 6. Atualizar Configurações do Cartola
  app.post<{ Params: { leagueId: string }; Body: { initialBudget?: number } }>(
    "/api/fantasy/leagues/:leagueId/settings",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.updateSettings(auth.actor, request.params.leagueId, request.body);
        if (!res.success) return reply.code(400).send({ code: "INVALID_SETTINGS", message: res.error });
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 7. Reprocessar Rodada
  app.post<{ Params: { leagueId: string; roundId: string }; Body: { useCurrentRules?: boolean } }>(
    "/api/fantasy/leagues/:leagueId/rounds/:roundId/reprocess",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.reprocessRound(
          auth.actor,
          request.params.leagueId,
          request.params.roundId,
          request.body?.useCurrentRules
        );
        if (!res.success) return reply.code(403).send({ code: "FORBIDDEN", message: res.error });
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 8. Criar Sessão de Teste
  app.post<{ Params: { leagueId: string; roundId: string } }>(
    "/api/fantasy/leagues/:leagueId/rounds/:roundId/test-session/create",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.createTestSession(auth.actor, request.params.leagueId, request.params.roundId);
        if (!res.success) return reply.code(403).send({ code: "FORBIDDEN", message: res.error });
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 9. Processar Sessão de Teste
  app.post<{ Params: { leagueId: string; roundId: string } }>(
    "/api/fantasy/leagues/:leagueId/rounds/:roundId/test-session/process",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.processTestSession(auth.actor, request.params.leagueId, request.params.roundId);
        if (!res.success) return reply.code(403).send({ code: "FORBIDDEN", message: res.error });
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 10. Resetar Sessão de Teste
  app.post<{ Params: { leagueId: string; roundId: string } }>(
    "/api/fantasy/leagues/:leagueId/rounds/:roundId/test-session/reset",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.resetTestSession(auth.actor, request.params.leagueId, request.params.roundId);
        if (!res.success) return reply.code(403).send({ code: "FORBIDDEN", message: res.error });
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );
}
