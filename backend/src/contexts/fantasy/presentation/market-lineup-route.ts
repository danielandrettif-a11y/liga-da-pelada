import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  ManageFantasyMarketLineupUseCase,
  type FantasyMarketLineupRepository,
} from "../application/manage-market-lineup.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, "fantasy operation failed");
  return reply.code(500).send({
    code: "FANTASY_SERVER_ERROR",
    message: (error as Error)?.message || "Erro no servidor de fantasy.",
  });
}

export function registerMarketLineupRoutes(
  app: FastifyInstance,
  dependencies: {
    verifier: UserVerifier;
    repository: FantasyMarketLineupRepository;
  }
): void {
  const useCase = new ManageFantasyMarketLineupUseCase(dependencies.repository);

  app.get<{ Params: { leagueId: string } }>("/api/fantasy/leagues/:leagueId/market-source", async (request, reply) => {
    const auth = await authenticateBearer(request, dependencies.verifier);
    if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
    try {
      const data = await useCase.getMarketSource(auth.actor, request.params.leagueId);
      if (!data) return reply.code(403).send({ code: "FORBIDDEN", message: "Mercado indisponível ou acesso não autorizado." });
      return reply.code(200).send(data);
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });

  app.get<{ Params: { leagueId: string } }>("/api/fantasy/leagues/:leagueId/market-context", async (request, reply) => {
    const auth = await authenticateBearer(request, dependencies.verifier);
    if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
    try {
      const data = await useCase.getMarketContext(auth.actor, request.params.leagueId);
      if (!data) return reply.code(403).send({ code: "FORBIDDEN", message: "Temporada indisponível ou acesso não autorizado." });
      return reply.code(200).send(data);
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });

  app.get<{ Params: { leagueId: string }; Querystring: { activeRoundId?: string; latestRoundId?: string; testSessionId?: string } }>("/api/fantasy/leagues/:leagueId/personal-market-inputs", async (request, reply) => {
    const auth = await authenticateBearer(request, dependencies.verifier);
    if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
    try {
      const data = await useCase.getPersonalMarketInputs(auth.actor, request.params.leagueId, request.query.activeRoundId, request.query.latestRoundId, request.query.testSessionId);
      if (!data) return reply.code(403).send({ code: "FORBIDDEN", message: "Temporada ou rodada indisponível para esta pelada." });
      return reply.code(200).send(data);
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });

  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/fantasy/leagues/:leagueId/rounds/:roundId/match-snapshots",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const matches = await useCase.getLiveMatchSnapshots(auth.actor, request.params.leagueId, request.params.roundId);
        if (matches === null) return reply.code(403).send({ code: "FORBIDDEN", message: "Rodada fora da pelada ou acesso não autorizado." });
        return reply.code(200).send(matches);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/fantasy/leagues/:leagueId/rounds/:roundId/projection-inputs",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const data = await useCase.getLiveProjectionInputs(auth.actor, request.params.leagueId, request.params.roundId);
        if (!data) return reply.code(403).send({ code: "FORBIDDEN", message: "Rodada indisponível ou mercado ainda aberto." });
        return reply.code(200).send(data);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/fantasy/leagues/:leagueId/rounds/:roundId/revealed-inputs",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const data = await useCase.getRevealedInputs(auth.actor, request.params.leagueId, request.params.roundId);
        if (!data) return reply.code(403).send({ code: "FORBIDDEN", message: "Rodada indisponível ou mercado ainda aberto." });
        return reply.code(200).send(data);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // 1. Dashboard
  app.get<{ Params: { leagueId: string } }>(
    "/api/fantasy/leagues/:leagueId/dashboard",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const data = await useCase.getDashboard(auth.actor, request.params.leagueId);
        return reply.code(200).send(data);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 2. Detalhe do atleta
  app.get<{ Params: { leagueId: string; playerId: string }; Querystring: { fantasyRoundId?: string } }>(
    "/api/fantasy/leagues/:leagueId/players/:playerId",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const player = await useCase.getPlayerDetail(
          auth.actor,
          request.params.leagueId,
          request.params.playerId,
          request.query.fantasyRoundId
        );
        if (!player) {
          return reply.code(404).send({ code: "NOT_FOUND", message: "Atleta não encontrado." });
        }
        return reply.code(200).send(player);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 3. Quick Highlights
  app.get<{ Params: { leagueId: string } }>(
    "/api/fantasy/leagues/:leagueId/quick-highlights",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const highlights = await useCase.getQuickHighlights(auth.actor, request.params.leagueId);
        if (highlights === null) return reply.type("application/json").code(200).send("null");
        return reply.code(200).send(highlights);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 4. Meu Resumo
  app.get<{ Params: { leagueId: string } }>(
    "/api/fantasy/leagues/:leagueId/my-summary",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const summary = await useCase.getMySummary(auth.actor, request.params.leagueId);
        return reply.code(200).send(summary);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 5. Meu Histórico
  app.get<{ Params: { leagueId: string } }>(
    "/api/fantasy/leagues/:leagueId/my-history",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const history = await useCase.getMyHistory(auth.actor, request.params.leagueId);
        return reply.code(200).send(history);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 6. Escalações Reveladas
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/fantasy/leagues/:leagueId/rounds/:roundId/revealed-lineups",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await useCase.getRevealedLineups(
          auth.actor,
          request.params.leagueId,
          request.params.roundId
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 7. Visão Geral da Rodada
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/fantasy/leagues/:leagueId/rounds/:roundId/overview",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const overview = await useCase.getRoundLineupOverview(
          auth.actor,
          request.params.leagueId,
          request.params.roundId
        );
        return reply.code(200).send(overview);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 8. Salvar Escalação
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: import("../domain/market-lineup.js").FantasyLineupSubmission;
  }>("/api/fantasy/leagues/:leagueId/rounds/:roundId/lineup", async (request, reply) => {
    const auth = await authenticateBearer(request, dependencies.verifier);
    if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
    try {
      const result = await useCase.saveLineup(
        auth.actor,
        request.params.leagueId,
        request.params.roundId,
        request.body
      );
      if (!result.success) {
        return reply.code(400).send({ code: "INVALID_LINEUP", message: result.error });
      }
      return reply.code(200).send(result);
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });

  // 9. Preview Mercado V11 (Admin)
  app.post<{ Params: { leagueId: string } }>(
    "/api/fantasy/leagues/:leagueId/preview-market",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await useCase.previewMarketV11(auth.actor, request.params.leagueId);
        if (!result.success) {
          return reply.code(403).send({ code: "FORBIDDEN", message: result.error });
        }
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 10. Reparar Escalações Antigas (Admin)
  app.post<{ Params: { leagueId: string } }>(
    "/api/fantasy/leagues/:leagueId/repair-lineups",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await useCase.repairLegacyLineups(auth.actor, request.params.leagueId);
        if (!result.success) {
          return reply.code(403).send({ code: "FORBIDDEN", message: result.error });
        }
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );
}
