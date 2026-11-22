import type { FastifyInstance } from "fastify";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { registerGoal, type GoalRepository } from "../application/register-goal.js";
import { GoalValidationError, type GoalCommand } from "../domain/goal.js";
import { GoalPersistenceError } from "../infrastructure/pg-goal-repository.js";

type GoalBody = {
  player_id: string;
  team_id: string;
  assist_player_id?: string | null;
  minute?: number;
  idempotency_key: string;
  is_own_goal?: boolean;
};

const goalBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["player_id", "team_id", "idempotency_key"],
  properties: {
    player_id: { type: "string", format: "uuid" },
    team_id: { type: "string", format: "uuid" },
    assist_player_id: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
    minute: { type: "integer", minimum: 0 },
    idempotency_key: { type: "string", minLength: 1, maxLength: 200 },
    is_own_goal: { type: "boolean" },
  },
} as const;

export function registerGoalRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: GoalRepository;
}): void {
  app.post<{ Params: { matchId: string }; Body: GoalBody }>(
    "/api/matches/:matchId/goals",
    {
      schema: {
        params: {
          type: "object",
          required: ["matchId"],
          properties: { matchId: { type: "string", format: "uuid" } },
        },
        body: goalBodySchema,
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) {
        return reply.code(authentication.error.statusCode).send({ code: authentication.error.code, message: authentication.error.message });
      }
      const command: GoalCommand = {
        matchId: request.params.matchId,
        playerId: request.body.player_id,
        teamId: request.body.team_id,
        assistPlayerId: request.body.assist_player_id,
        minute: request.body.minute,
        idempotencyKey: request.body.idempotency_key,
        isOwnGoal: request.body.is_own_goal,
      };
      try {
        return await registerGoal(command, authentication.actor, dependencies.repository);
      } catch (error) {
        if (error instanceof GoalValidationError) {
          return reply.code(400).send({ code: "INVALID_GOAL", message: error.message });
        }
        if (error instanceof GoalPersistenceError) {
          return reply.code(error.statusCode).send({ code: "GOAL_REJECTED", message: error.message });
        }
        request.log.error({ err: error }, "goal registration failed");
        return reply.code(503).send({ code: "GOAL_UNAVAILABLE", message: "Resultado incerto; repita com a mesma chave." });
      }
    },
  );
}
