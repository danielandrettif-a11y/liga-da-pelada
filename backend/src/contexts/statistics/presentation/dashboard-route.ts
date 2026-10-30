import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  createManageDashboardService,
  type DashboardRepository,
} from "../application/manage-dashboard.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, "dashboard operation failed");
  return reply.code(500).send({
    code: "STATISTICS_SERVER_ERROR",
    message: (error as Error)?.message || "Erro no servidor de estatísticas.",
  });
}

export function registerDashboardRoutes(
  app: FastifyInstance,
  dependencies: {
    verifier: UserVerifier;
    repository: DashboardRepository;
  },
): void {
  const service = createManageDashboardService(dependencies.repository);

  app.get<{ Params: { leagueId: string } }>(
    "/api/statistics/leagues/:leagueId/dashboard",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send(authentication.error);
      }

      try {
        const data = await service.getDashboard({
          leagueId: request.params.leagueId,
        });
        return reply.code(200).send({ success: true, data });
      } catch (error: any) {
        return sendFailure(error, request, reply);
      }
    },
  );
}

