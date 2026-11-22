import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  updateLeagueBranding,
  type LeagueBrandingRepository,
  type LeagueBrandingStorage,
} from "../application/manage-league-branding.js";
import { InvalidLeagueBrandingError } from "../domain/league-branding.js";
import { InvalidLeagueIdError } from "../domain/league.js";
import { LeagueBrandingPersistenceError } from "../infrastructure/pg-league-branding-repository.js";
import { LeagueBrandingStorageError } from "../infrastructure/supabase-league-branding-storage.js";

type ParsedAsset = { contentType: string; bytes: Uint8Array };

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidLeagueBrandingError || error instanceof InvalidLeagueIdError) {
    return reply.code(400).send({ code: "INVALID_LEAGUE_BRANDING", message: error.message });
  }
  if (error instanceof LeagueBrandingPersistenceError || error instanceof LeagueBrandingStorageError) {
    return reply.code(error.statusCode).send({ code: "LEAGUE_BRANDING_REJECTED", message: error.message });
  }
  if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 413) {
    return reply.code(413).send({ code: "LEAGUE_BRANDING_TOO_LARGE", message: "A imagem excede o limite permitido." });
  }
  request.log.error({ err: error }, "league branding operation failed");
  return reply.code(503).send({ code: "LEAGUE_BRANDING_UNAVAILABLE", message: "Serviço indisponível." });
}

async function parseMultipart(request: FastifyRequest) {
  const fields = new Map<string, string>();
  const assets = new Map<"logo" | "cover", ParsedAsset>();
  for await (const part of request.parts({
    limits: { fieldNameSize: 50, fieldSize: 100, fields: 3, files: 2, parts: 5, fileSize: 8 * 1024 * 1024 },
  })) {
    if (part.type === "file") {
      if (part.fieldname !== "logo" && part.fieldname !== "cover") {
        throw new InvalidLeagueBrandingError("Arquivo de identidade visual desconhecido.");
      }
      if (assets.has(part.fieldname)) throw new InvalidLeagueBrandingError("Arquivo duplicado.");
      assets.set(part.fieldname, { contentType: part.mimetype, bytes: await part.toBuffer() });
    } else {
      if (typeof part.value !== "string") throw new InvalidLeagueBrandingError();
      if (!["accent_color", "remove_logo", "remove_cover"].includes(part.fieldname)) {
        throw new InvalidLeagueBrandingError("Campo de identidade visual desconhecido.");
      }
      if (fields.has(part.fieldname)) throw new InvalidLeagueBrandingError("Campo duplicado.");
      fields.set(part.fieldname, part.value);
    }
  }
  return {
    accent_color: fields.get("accent_color") || "",
    logo: assets.get("logo") || null,
    cover: assets.get("cover") || null,
    remove_logo: fields.get("remove_logo") === "1" || fields.get("remove_logo") === "true",
    remove_cover: fields.get("remove_cover") === "1" || fields.get("remove_cover") === "true",
  };
}

export function registerLeagueBrandingRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: LeagueBrandingRepository;
  storage: LeagueBrandingStorage;
}): void {
  app.patch<{ Params: { leagueId: string } }>(
    "/api/leagues/:leagueId/branding",
    {
      schema: {
        params: {
          type: "object", required: ["leagueId"],
          properties: { leagueId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const authorization = request.headers.authorization as string;
        return await updateLeagueBranding(
          request.params.leagueId,
          await parseMultipart(request),
          authentication.actor,
          authorization.slice("Bearer ".length),
          dependencies.repository,
          dependencies.storage,
        );
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
