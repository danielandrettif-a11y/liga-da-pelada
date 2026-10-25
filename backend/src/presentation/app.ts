import Fastify, { type FastifyInstance } from "fastify";
import { registerGoal, type GoalRepository } from "../contexts/matches/application/register-goal.js";
import { GoalValidationError, type GoalCommand } from "../contexts/matches/domain/goal.js";
import { GoalPersistenceError } from "../contexts/matches/infrastructure/pg-goal-repository.js";
import type { UserVerifier } from "../infrastructure/auth-user-verifier.js";
import { createLeague, type LeagueRepository } from "../contexts/leagues/application/create-league.js";
import { InvalidLeagueError } from "../contexts/leagues/domain/league.js";
import { LeaguePersistenceError } from "../contexts/leagues/infrastructure/pg-league-repository.js";

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

export function createApp(dependencies: {
  goalsEnabled: boolean;
  leaguesEnabled?: boolean;
  verifier: UserVerifier;
  repository: GoalRepository;
  leagueRepository?: LeagueRepository;
  logger?: boolean;
}): FastifyInstance {
  if (dependencies.leaguesEnabled && !dependencies.leagueRepository) {
    throw new Error("LeagueRepository é obrigatório quando ENABLE_LEAGUE_API=true.");
  }
  const app = Fastify({ logger: dependencies.logger ?? true });
  app.setErrorHandler((error, request, reply) => {
    if (error && typeof error === "object" && "validation" in error && error.validation) {
      return reply.code(400).send({ code: "INVALID_REQUEST", message: "Dados da requisição inválidos." });
    }
    request.log.error({ err: error }, "unhandled request error");
    return reply.code(503).send({ code: "UNAVAILABLE", message: "Serviço indisponível." });
  });
  app.get("/health", async () => ({ status: "ok" }));

  // The route is absent unless the operator explicitly enables the staged API.
  if (dependencies.goalsEnabled) {
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
        const authorization = request.headers.authorization;
        if (!authorization?.startsWith("Bearer ") || authorization.length <= 7) {
          return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Sessão ausente." });
        }

        let actor;
        try {
          actor = await dependencies.verifier.verifyAccessToken(authorization.slice(7));
        } catch (error) {
          request.log.error({ err: error }, "auth verification failed");
          return reply.code(503).send({ code: "AUTH_UNAVAILABLE", message: "Autenticação indisponível." });
        }
        if (!actor) {
          return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Sessão inválida." });
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
          return await registerGoal(command, actor, dependencies.repository);
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

  if (dependencies.leaguesEnabled) {
    const leagueRepository = dependencies.leagueRepository!;
    app.post<{ Body: { name: string; tier: string; visibility: string } }>(
      "/api/leagues",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: ["name", "tier", "visibility"],
            properties: {
              name: { type: "string", minLength: 1, maxLength: 200 },
              tier: { type: "string", enum: ["quick", "basic", "complete"] },
              visibility: { type: "string", enum: ["private", "open"] },
            },
          },
        },
      },
      async (request, reply) => {
        const authorization = request.headers.authorization;
        if (!authorization?.startsWith("Bearer ") || authorization.length <= 7) {
          return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Sessão ausente." });
        }
        let actor;
        try {
          actor = await dependencies.verifier.verifyAccessToken(authorization.slice(7));
        } catch (error) {
          request.log.error({ err: error }, "auth verification failed");
          return reply.code(503).send({ code: "AUTH_UNAVAILABLE", message: "Autenticação indisponível." });
        }
        if (!actor) return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Sessão inválida." });
        try {
          const created = await createLeague(request.body, actor, leagueRepository);
          return reply.code(201).send(created);
        } catch (error) {
          if (error instanceof InvalidLeagueError) {
            return reply.code(400).send({ code: "INVALID_LEAGUE", message: error.message });
          }
          if (error instanceof LeaguePersistenceError) {
            return reply.code(error.statusCode).send({ code: "LEAGUE_REJECTED", message: error.message });
          }
          request.log.error({ err: error }, "league creation failed");
          return reply.code(503).send({ code: "LEAGUE_UNAVAILABLE", message: "Serviço indisponível." });
        }
      },
    );
  }

  return app;
}
