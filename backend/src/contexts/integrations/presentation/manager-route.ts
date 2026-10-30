import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  ManageManagerUseCase,
  type ManagerRepository,
} from "../application/manage-manager.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, "manager operation failed");
  const message = error instanceof Error ? error.message : "Erro interno no serviço BQ Manager.";
  return reply.code(500).send({ ok: false, message });
}

export function registerManagerRoutes(
  app: FastifyInstance,
  options: {
    repository: ManagerRepository;
    userVerifier: UserVerifier;
  }
) {
  const useCase = new ManageManagerUseCase(options.repository);

  // 1. Criar Clube
  app.post<{ Body: { identity: any } }>(
    "/api/integrations/manager/club",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      try {
        const res = await useCase.createClub(auth.actor, request.body?.identity || {});
        return reply.code(res.ok ? 200 : 400).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 2. Executar Comando
  app.post<{ Body: { command: any; expectedVersion: number } }>(
    "/api/integrations/manager/command",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      const { command, expectedVersion } = request.body || {};
      try {
        const res = await useCase.runCommand(auth.actor, command, expectedVersion);
        return reply.code(res.ok ? 200 : 400).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );
}
