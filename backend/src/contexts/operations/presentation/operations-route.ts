import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  ManageOperationsUseCase,
  type OperationsRepository,
} from "../application/manage-operations.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, "operations operation failed");
  const message = error instanceof Error ? error.message : "Erro interno no serviço de operações.";
  return reply.code(500).send({ success: false, error: message });
}

export function registerOperationsRoutes(
  app: FastifyInstance,
  options: {
    repository: OperationsRepository;
    userVerifier: UserVerifier;
    internalToken: string;
  }
) {
  const useCase = new ManageOperationsUseCase(options.repository);

  // 1. Performance Summary
  app.get<{ Querystring: { hours?: string } }>(
    "/api/operations/performance-summary",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);
      const hours = Number(request.query.hours || 24);
      try {
        const summary = await useCase.getPerformanceSummary(auth.actor, hours);
        return reply.code(200).send(summary);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 2. Observability Ingestion
  app.post<{ Body: any }>(
    "/api/internal/operations/observability",
    async (request, reply) => {
      if (request.headers.authorization !== `Bearer ${options.internalToken}`) {
        return reply.code(401).send({ success: false, error: "Credencial interna inválida." });
      }
      const event = (request.body || {}) as any;
      try {
        const res = await useCase.recordServerEvent(event);
        return reply.code(res.success ? 204 : 400).send(res.success ? null : res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );
}
