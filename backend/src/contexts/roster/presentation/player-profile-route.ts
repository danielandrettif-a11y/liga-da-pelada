import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  deletePlayerProfile,
  savePlayerProfile,
  type PlayerAvatarStorage,
  type PlayerProfileRepository,
} from "../application/save-player-profile.js";
import { InvalidPlayerManagementError } from "../domain/player-management.js";
import { PlayerProfilePersistenceError } from "../infrastructure/pg-player-profile-repository.js";
import { PlayerAvatarStorageError } from "../infrastructure/supabase-player-avatar-storage.js";

type ParsedAsset = { contentType: string; bytes: Uint8Array };

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidPlayerManagementError) {
    return reply.code(400).send({ code: "INVALID_PLAYER_PROFILE", message: error.message });
  }
  if (error instanceof PlayerProfilePersistenceError || error instanceof PlayerAvatarStorageError) {
    return reply.code(error.statusCode).send({ code: "PLAYER_PROFILE_REJECTED", message: error.message });
  }
  if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 413) {
    return reply.code(413).send({ code: "PLAYER_PROFILE_TOO_LARGE", message: "A foto excede o limite permitido." });
  }
  request.log.error({ err: error }, "player profile operation failed");
  return reply.code(503).send({ code: "PLAYER_PROFILE_UNAVAILABLE", message: "Serviço indisponível." });
}

const allowedFields = new Set([
  "name", "nickname", "profile_bio", "player_profile", "overall_traits", "member_category",
  "is_selectable", "remove_active_avatar", "remove_avatar", "remove_alternate_avatar", "use_alternate_avatar",
]);

async function parseMultipart(request: FastifyRequest) {
  const fields = new Map<string, string[]>();
  let activeAvatar: ParsedAsset | null = null;
  let alternateAvatar: ParsedAsset | null = null;
  for await (const part of request.parts({
    limits: { fieldNameSize: 60, fieldSize: 2_048, fields: 16, files: 2, parts: 18, fileSize: 5 * 1024 * 1024 },
  })) {
    if (part.type === "file") {
      const active = part.fieldname === "avatar_active" || part.fieldname === "avatar";
      const alternate = part.fieldname === "avatar_alternate";
      if (!active && !alternate) throw new InvalidPlayerManagementError("Arquivo de foto desconhecido.");
      if ((active && activeAvatar) || (alternate && alternateAvatar)) {
        throw new InvalidPlayerManagementError("Arquivo de foto duplicado.");
      }
      const asset = { contentType: part.mimetype, bytes: await part.toBuffer() };
      if (active) activeAvatar = asset;
      else alternateAvatar = asset;
    } else {
      if (!allowedFields.has(part.fieldname) || typeof part.value !== "string") {
        throw new InvalidPlayerManagementError("Campo de perfil desconhecido.");
      }
      const values = fields.get(part.fieldname) || [];
      if (part.fieldname !== "overall_traits" && values.length) {
        throw new InvalidPlayerManagementError("Campo de perfil duplicado.");
      }
      values.push(part.value);
      fields.set(part.fieldname, values);
    }
  }
  const first = (name: string) => fields.get(name)?.[0];
  return {
    name: first("name"),
    nickname: first("nickname"),
    profile_bio: first("profile_bio"),
    player_profile: first("player_profile"),
    overall_traits: fields.get("overall_traits") || [],
    member_category: first("member_category"),
    is_selectable: first("is_selectable"),
    remove_active_avatar: first("remove_active_avatar"),
    remove_avatar: first("remove_avatar"),
    remove_alternate_avatar: first("remove_alternate_avatar"),
    use_alternate_avatar: first("use_alternate_avatar"),
    activeAvatar,
    alternateAvatar,
  };
}

const leagueParams = {
  type: "object", required: ["leagueId"], properties: { leagueId: { type: "string", format: "uuid" } },
} as const;
const playerParams = {
  type: "object", required: ["leagueId", "playerId"], properties: {
    leagueId: { type: "string", format: "uuid" }, playerId: { type: "string", format: "uuid" },
  },
} as const;

export function registerPlayerProfileRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: PlayerProfileRepository;
  storage: PlayerAvatarStorage;
}): void {
  const save = async (
    request: FastifyRequest<{ Params: { leagueId: string; playerId?: string } }>, reply: FastifyReply,
  ) => {
    const authentication = await authenticateBearer(request, dependencies.verifier);
    if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
    try {
      const authorization = request.headers.authorization as string;
      const playerId = await savePlayerProfile(
        request.params.leagueId,
        request.params.playerId || null,
        await parseMultipart(request),
        authentication.actor,
        authorization.slice("Bearer ".length),
        dependencies.repository,
        dependencies.storage,
      );
      return reply.code(request.params.playerId ? 200 : 201).send({ playerId });
    } catch (error) {
      return sendFailure(error, request, reply);
    }
  };

  app.post<{ Params: { leagueId: string } }>(
    "/api/roster/leagues/:leagueId/player-profiles",
    { schema: { params: leagueParams } },
    save,
  );
  app.patch<{ Params: { leagueId: string; playerId: string } }>(
    "/api/roster/leagues/:leagueId/players/:playerId/profile",
    { schema: { params: playerParams } },
    save,
  );
  app.delete<{ Params: { leagueId: string; playerId: string } }>(
    "/api/roster/leagues/:leagueId/players/:playerId",
    { schema: { params: playerParams } },
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const authorization = request.headers.authorization as string;
        await deletePlayerProfile(
          request.params.leagueId,
          request.params.playerId,
          authentication.actor,
          authorization.slice("Bearer ".length),
          dependencies.repository,
          dependencies.storage,
        );
        return reply.code(204).send();
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
