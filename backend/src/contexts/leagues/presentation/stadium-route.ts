import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  deleteStadium,
  getStadiums,
  reorderStadiums,
  saveStadium,
  type StadiumRepository,
} from "../application/manage-stadiums.js";
import { InvalidLeagueIdError } from "../domain/league.js";
import { InvalidStadiumError } from "../domain/stadium.js";
import { StadiumPersistenceError } from "../infrastructure/pg-stadium-repository.js";

type StadiumBody = {
  name: string;
  address?: string | null;
  google_maps_url: string;
  latitude?: number | null;
  longitude?: number | null;
};

const leagueParams = {
  type: "object",
  required: ["leagueId"],
  properties: { leagueId: { type: "string", format: "uuid" } },
} as const;

const stadiumParams = {
  type: "object",
  required: ["leagueId", "stadiumId"],
  properties: {
    leagueId: { type: "string", format: "uuid" },
    stadiumId: { type: "string", format: "uuid" },
  },
} as const;

const stadiumBody = {
  type: "object",
  additionalProperties: false,
  required: ["name", "google_maps_url"],
  properties: {
    name: { type: "string", maxLength: 160 },
    address: { type: ["string", "null"], maxLength: 500 },
    google_maps_url: { type: "string", maxLength: 2048 },
    latitude: { type: ["number", "null"] },
    longitude: { type: ["number", "null"] },
  },
} as const;

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidLeagueIdError || error instanceof InvalidStadiumError) {
    return reply.code(400).send({ code: "INVALID_STADIUM_REQUEST", message: error.message });
  }
  if (error instanceof StadiumPersistenceError) {
    return reply.code(error.statusCode).send({ code: "STADIUM_REJECTED", message: error.message });
  }
  request.log.error({ err: error }, "stadium operation failed");
  return reply.code(503).send({ code: "STADIUM_UNAVAILABLE", message: "Serviço indisponível." });
}

export function registerStadiumRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: StadiumRepository;
}): void {
  app.get<{ Params: { leagueId: string } }>(
    "/api/leagues/:leagueId/stadiums",
    { schema: { params: leagueParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return { stadiums: await getStadiums(request.params.leagueId, authentication.actor, dependencies.repository) };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.post<{ Params: { leagueId: string }; Body: StadiumBody }>(
    "/api/leagues/:leagueId/stadiums",
    { schema: { params: leagueParams, body: stadiumBody } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const stadium = await saveStadium(
          request.params.leagueId, null, request.body, authentication.actor, dependencies.repository,
        );
        return reply.code(201).send({ stadium });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.patch<{ Params: { leagueId: string; stadiumId: string }; Body: StadiumBody }>(
    "/api/leagues/:leagueId/stadiums/:stadiumId",
    { schema: { params: stadiumParams, body: stadiumBody } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const stadium = await saveStadium(
          request.params.leagueId, request.params.stadiumId, request.body,
          authentication.actor, dependencies.repository,
        );
        return { stadium };
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.delete<{ Params: { leagueId: string; stadiumId: string } }>(
    "/api/leagues/:leagueId/stadiums/:stadiumId",
    { schema: { params: stadiumParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await deleteStadium(
          request.params.leagueId, request.params.stadiumId, authentication.actor, dependencies.repository,
        );
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  app.put<{ Params: { leagueId: string }; Body: { stadium_ids: string[] } }>(
    "/api/leagues/:leagueId/stadiums/order",
    {
      schema: {
        params: leagueParams,
        body: {
          type: "object", additionalProperties: false, required: ["stadium_ids"],
          properties: {
            stadium_ids: {
              type: "array", maxItems: 100, uniqueItems: true,
              items: { type: "string", format: "uuid" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        return await reorderStadiums(
          request.params.leagueId, request.body.stadium_ids, authentication.actor, dependencies.repository,
        );
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
