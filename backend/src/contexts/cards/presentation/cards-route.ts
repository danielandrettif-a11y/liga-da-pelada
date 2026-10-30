import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  ManageCardsUseCase,
  type CardsRepository,
} from "../application/manage-cards.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, "cards operation failed");
  return reply.code(500).send({
    code: "CARDS_SERVER_ERROR",
    message: (error as Error)?.message || "Erro no servidor de cartas.",
  });
}

export function registerCardsRoutes(
  app: FastifyInstance,
  dependencies: {
    verifier: UserVerifier;
    repository: CardsRepository;
  }
): void {
  const useCase = new ManageCardsUseCase(dependencies.repository);

  // 1. Meus Pacotes
  app.get<{ Params: { leagueId: string } }>(
    "/api/cards/leagues/:leagueId/packs",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const packs = await useCase.getMyPacks(auth.actor, request.params.leagueId);
        return reply.code(200).send(packs);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 2. Restaurar Pacotes do Passe
  app.post<{ Params: { leagueId: string }; Body: { fantasySeasonId: string } }>(
    "/api/cards/leagues/:leagueId/packs/restore",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.restoreMyPassPacks(auth.actor, request.params.leagueId, request.body.fantasySeasonId);
        if (!res.success) return reply.code(403).send({ code: "FORBIDDEN", message: res.error });
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 3. Abrir Pacote
  app.post<{ Params: { leagueId: string; packId: string } }>(
    "/api/cards/leagues/:leagueId/packs/:packId/open",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.openPack(auth.actor, request.params.leagueId, request.params.packId);
        if (!res.success) return reply.code(400).send({ code: "INVALID_PACK", message: res.error });
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 4. Resgatar Carta do Pacote
  app.post<{ Params: { leagueId: string; packId: string }; Body: { chosenSlug: string } }>(
    "/api/cards/leagues/:leagueId/packs/:packId/claim",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.claimPackCard(
          auth.actor,
          request.params.leagueId,
          request.params.packId,
          request.body.chosenSlug
        );
        if (!res.success) return reply.code(400).send({ code: "INVALID_CLAIM", message: res.error });
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 5. Meu Inventário
  app.get<{ Params: { leagueId: string } }>(
    "/api/cards/leagues/:leagueId/inventory",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const inv = await useCase.getMyInventory(auth.actor, request.params.leagueId);
        return reply.code(200).send(inv);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 6. Quantidade no Inventário
  app.get<{ Params: { leagueId: string } }>(
    "/api/cards/leagues/:leagueId/inventory/count",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const count = await useCase.getMyInventoryCount(auth.actor, request.params.leagueId);
        return reply.code(200).send({ count });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 7. Carta Ativa da Rodada
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/cards/leagues/:leagueId/rounds/:roundId/active",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const active = await useCase.getActiveCardForRound(auth.actor, request.params.leagueId, request.params.roundId);
        return reply.code(200).send(active);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 8. Ativar Carta para Rodada
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: {
      userCardId: string;
      cardSlug: string;
      targetPlayerId?: string | null;
      targetPlayer2Id?: string | null;
      targetPrediction?: string | null;
    };
  }>("/api/cards/leagues/:leagueId/rounds/:roundId/activate", async (request, reply) => {
    const auth = await authenticateBearer(request, dependencies.verifier);
    if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
    try {
      const res = await useCase.activateCardForRound(auth.actor, request.params.leagueId, {
        roundId: request.params.roundId,
        ...request.body,
      });
      if (!res.success) return reply.code(400).send({ code: "INVALID_ACTIVATION", message: res.error });
      return reply.code(200).send(res);
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  });

  // 9. Remover Carta Ativa da Rodada
  app.delete<{ Params: { leagueId: string; roundId: string } }>(
    "/api/cards/leagues/:leagueId/rounds/:roundId/active",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.removeActiveCardForRound(auth.actor, request.params.leagueId, request.params.roundId);
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 10. Gerar Pacotes da Rodada Encerrada (Admin)
  app.post<{ Params: { leagueId: string; roundId: string } }>(
    "/api/cards/leagues/:leagueId/rounds/:roundId/generate-packs",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const count = await useCase.generatePacksForFinishedRound(auth.actor, request.params.leagueId, request.params.roundId);
        return reply.code(200).send({ count });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 11. Pacote de Teste
  app.post<{ Params: { leagueId: string } }>(
    "/api/cards/leagues/:leagueId/packs/test",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.giveMyAccountTestPack(auth.actor, request.params.leagueId);
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 12. Resetar Minhas Cartas
  app.post<{ Params: { leagueId: string } }>(
    "/api/cards/leagues/:leagueId/reset",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.resetMyAccountCards(auth.actor, request.params.leagueId);
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 13. Distribuir Pacote para Todos os Escalados (Admin)
  app.post<{ Params: { leagueId: string } }>(
    "/api/cards/leagues/:leagueId/packs/distribute",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.distributePackToAllLineupUsers(auth.actor, request.params.leagueId);
        if (!res.success) return reply.code(403).send({ code: "FORBIDDEN", message: res.error });
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 14. Auditar e Reparar Pacotes (Admin)
  app.post<{ Params: { leagueId: string } }>(
    "/api/cards/leagues/:leagueId/packs/audit-repair",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.auditAndRepairCurrentSeasonPacks(auth.actor, request.params.leagueId);
        if (!res.success) return reply.code(403).send({ code: "FORBIDDEN", message: res.error });
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );

  // 15. Conceder Pacote a Usuário (Admin)
  app.post<{ Params: { leagueId: string }; Body: { targetUserId: string } }>(
    "/api/cards/leagues/:leagueId/packs/grant",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const res = await useCase.grantFantasyPackToUser(auth.actor, request.params.leagueId, request.body.targetUserId);
        if (!res.success) return reply.code(403).send({ code: "FORBIDDEN", message: res.error });
        return reply.code(200).send(res);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    }
  );
}
