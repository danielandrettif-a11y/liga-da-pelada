import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  createManageFinanceService,
  type FinanceRepository,
} from "../application/manage-finance.js";
import type {
  ExpenseItemInput,
  PaymentRecipientInput,
  RoundPaymentDetailsInput,
} from "../domain/finance.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, "finance operation failed");
  return reply.code(500).send({
    code: "FINANCE_SERVER_ERROR",
    message: (error as Error)?.message || "Erro no servidor financeiro.",
  });
}

export function registerFinanceRoutes(
  app: FastifyInstance,
  dependencies: {
    verifier: UserVerifier;
    repository: FinanceRepository;
  },
): void {
  const service = createManageFinanceService(dependencies.repository);

  // 1. Despesas: Listar
  app.get<{ Params: { leagueId: string }; Querystring: { includeArchived?: string } }>(
    "/api/finance/leagues/:leagueId/expenses",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const includeArchived = request.query.includeArchived === "true";
        const items = await service.getExpenseItems(auth.actor, request.params.leagueId, includeArchived);
        return reply.code(200).send(items);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 2. Despesas: Criar/Salvar
  app.post<{ Params: { leagueId: string }; Body: ExpenseItemInput }>(
    "/api/finance/leagues/:leagueId/expenses",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await service.saveExpenseItem(auth.actor, request.params.leagueId, request.body);
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 3. Despesas: Atualizar Status
  app.patch<{ Params: { leagueId: string; id: string }; Body: { status: "active" | "archived" } }>(
    "/api/finance/leagues/:leagueId/expenses/:id/status",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await service.setExpenseItemStatus(
          auth.actor,
          request.params.leagueId,
          request.params.id,
          request.body?.status,
        );
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 4. Despesas: Parcelas Pagas
  app.patch<{ Params: { leagueId: string; id: string }; Body: { paidInstallments: number } }>(
    "/api/finance/leagues/:leagueId/expenses/:id/paid-installments",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await service.setExpenseItemPaidInstallments(
          auth.actor,
          request.params.leagueId,
          request.params.id,
          request.body?.paidInstallments,
        );
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 5. Destinatários: Listar
  app.get<{ Params: { leagueId: string }; Querystring: { includeInactive?: string } }>(
    "/api/finance/leagues/:leagueId/recipients",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const includeInactive = request.query.includeInactive === "true";
        const recipients = await service.getPaymentRecipients(auth.actor, request.params.leagueId, includeInactive);
        return reply.code(200).send(recipients);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 6. Destinatários: Salvar
  app.post<{ Params: { leagueId: string }; Body: PaymentRecipientInput }>(
    "/api/finance/leagues/:leagueId/recipients",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await service.savePaymentRecipient(auth.actor, request.params.leagueId, request.body);
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 7. Destinatários: Ativar/Desativar
  app.patch<{ Params: { leagueId: string; id: string }; Body: { active: boolean } }>(
    "/api/finance/leagues/:leagueId/recipients/:id/active",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await service.setPaymentRecipientActive(
          auth.actor,
          request.params.leagueId,
          request.params.id,
          Boolean(request.body?.active),
        );
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 8. Rodadas de Pagamento: Listar
  app.get<{ Params: { leagueId: string } }>(
    "/api/finance/leagues/:leagueId/rounds",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const rounds = await service.getPaymentRounds(auth.actor, request.params.leagueId);
        return reply.code(200).send(rounds);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 9. Rodadas de Pagamento: Tem Pendência
  app.get<{ Params: { leagueId: string } }>(
    "/api/finance/leagues/:leagueId/rounds/has-pending",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const hasPending = await service.hasPendingPaymentRound(auth.actor, request.params.leagueId);
        return reply.code(200).send({ hasPending });
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 10. Workspace de Pagamento
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/finance/leagues/:leagueId/rounds/:roundId/workspace",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const workspace = await service.getRoundPaymentWorkspace(auth.actor, request.params.leagueId, request.params.roundId);
        return reply.code(200).send(workspace);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 11. Jogadores da Rodada de Pagamento
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/finance/leagues/:leagueId/rounds/:roundId/players",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const players = await service.getRoundPaymentPlayers(auth.actor, request.params.leagueId, request.params.roundId);
        return reply.code(200).send(players);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 12. Obrigações Financeiras da Rodada
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/finance/leagues/:leagueId/rounds/:roundId/obligations",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const obligations = await service.getRoundPaymentObligations(auth.actor, request.params.leagueId, request.params.roundId);
        return reply.code(200).send(obligations);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 13. Marcar Obrigação como Paga
  app.patch<{ Params: { leagueId: string; id: string }; Body: { amountPaid: number } }>(
    "/api/finance/leagues/:leagueId/obligations/:id/paid",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await service.setPaymentObligationPaid(
          auth.actor,
          request.params.leagueId,
          request.params.id,
          Number(request.body?.amountPaid || 0),
        );
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 14. Confirmar Pagamento do Jogador
  app.post<{ Params: { leagueId: string; roundId: string }; Body: { playerId: string; paid: boolean } }>(
    "/api/finance/leagues/:leagueId/rounds/:roundId/payments",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await service.setPlayerPayment(
          auth.actor,
          request.params.leagueId,
          request.params.roundId,
          request.body?.playerId,
          Boolean(request.body?.paid),
        );
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 15. Seleções de Despesa da Rodada: Obter
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/finance/leagues/:leagueId/rounds/:roundId/expense-selections",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const selections = await service.getRoundExpenseSelections(auth.actor, request.params.leagueId, request.params.roundId);
        return reply.code(200).send(selections);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 16. Sincronizar Despesas da Rodada
  app.post<{ Params: { leagueId: string; roundId: string }; Body: { expenseItemIds: string[] } }>(
    "/api/finance/leagues/:leagueId/rounds/:roundId/expense-selections",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await service.syncRoundExpenseItems(
          auth.actor,
          request.params.leagueId,
          request.params.roundId,
          request.body?.expenseItemIds,
        );
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 17. Atualizar Detalhes do Pagamento da Rodada (PIX, extras, etc.)
  app.put<{ Params: { leagueId: string; roundId: string }; Body: RoundPaymentDetailsInput }>(
    "/api/finance/leagues/:leagueId/rounds/:roundId/details",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const result = await service.updateRoundPaymentDetails(
          auth.actor,
          request.params.leagueId,
          request.body,
        );
        return reply.code(result.success ? 200 : 400).send(result);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 18. Linhas de Cobrança da Rodada
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/finance/leagues/:leagueId/rounds/:roundId/charge-lines",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const lines = await service.getRoundPaymentChargeLines(auth.actor, request.params.leagueId, request.params.roundId);
        return reply.code(200).send(lines);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );

  // 19. Log de Auditoria de Pagamento
  app.get<{ Params: { leagueId: string } }>(
    "/api/finance/leagues/:leagueId/audit-log",
    async (request, reply) => {
      const auth = await authenticateBearer(request, dependencies.verifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      try {
        const log = await service.getPaymentAuditLog(auth.actor, request.params.leagueId);
        return reply.code(200).send(log);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    },
  );
}

