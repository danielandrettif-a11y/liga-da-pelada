import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  getBQScoringRules,
  getColumnCScoringRules,
  saveBQScoringRules,
  saveColumnCScoringRules,
  type ScoringRulesRepository,
  StatisticsValidationError,
} from "../application/manage-scoring-rules.js";
import {
  type BQBaseScoringSnapshot,
  type ColumnCScoringSettings,
  ScoringPolicyValidationError,
} from "../domain/scoring-policy.js";
import { ScoringRulesPersistenceError } from "../infrastructure/pg-scoring-rules-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (
    error instanceof ScoringPolicyValidationError
    || error instanceof StatisticsValidationError
  ) {
    return reply.code(400).send({ code: "INVALID_SCORING_REQUEST", message: error.message });
  }
  if (error instanceof ScoringRulesPersistenceError) {
    return reply.code(error.statusCode).send({ code: "SCORING_PERSISTENCE_ERROR", message: error.message });
  }
  request.log.error({ err: error }, "scoring rules operation failed");
  return reply.code(500).send({ code: "STATISTICS_SERVER_ERROR", message: "Erro no servidor de estatísticas." });
}

export function registerScoringRulesRoutes(
  app: FastifyInstance,
  dependencies: {
    verifier: UserVerifier;
    repository: ScoringRulesRepository;
  },
): void {
  // Leitura das regras BQ v5 da liga
  app.get<{ Params: { leagueId: string } }>(
    "/api/statistics/leagues/:leagueId/scoring/bq",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);

      try {
        const result = await getBQScoringRules(
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

  // Leitura das regras da Coluna C da liga
  app.get<{ Params: { leagueId: string } }>(
    "/api/statistics/leagues/:leagueId/scoring/column-c",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);

      try {
        const result = await getColumnCScoringRules(
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

  // Gravação das regras BQ v5 da liga (Admin)
  app.put<{ Params: { leagueId: string }; Body: BQBaseScoringSnapshot }>(
    "/api/statistics/leagues/:leagueId/scoring/bq",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);

      try {
        const result = await saveBQScoringRules(
          request.params.leagueId,
          request.body,
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Gravação das regras da Coluna C da liga (Admin)
  app.put<{
    Params: { leagueId: string };
    Body: {
      settings?: ColumnCScoringSettings;
      options?: { reprocessRanked?: boolean };
    } & Partial<ColumnCScoringSettings>;
  }>(
    "/api/statistics/leagues/:leagueId/scoring/column-c",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);

      try {
        const body = request.body || {};
        const settings = body.settings ?? body;
        const options = body.options;
        const result = await saveColumnCScoringRules(
          request.params.leagueId,
          settings,
          options,
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}

