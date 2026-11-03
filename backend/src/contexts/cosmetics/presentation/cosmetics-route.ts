import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  ManageCosmeticsUseCase,
  type CosmeticsRepository,
} from "../application/manage-cosmetics.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error({ err: error }, "cosmetics operation failed");
  return reply.code(500).send({ success: false, error: "Erro interno no serviço de cosméticos." });
}

export function registerCosmeticsRoutes(
  app: FastifyInstance,
  options: {
    repository: CosmeticsRepository;
    userVerifier: UserVerifier;
  }
) {
  const useCase = new ManageCosmeticsUseCase(options.repository);

  // 1. Dashboard
  app.get<{ Querystring: { leagueId?: string; seasonId?: string } }>(
    "/api/cosmetics/dashboard",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      const { leagueId = "", seasonId = null } = request.query;
      try {
        const dashboard = await useCase.getDashboard({
          userId: auth.actor.userId,
          leagueId,
          seasonId,
        });
        return reply.code(200).send(dashboard);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 2. Equip
  app.post<{ Body: { slot: string; cosmeticId: string | null } }>(
    "/api/cosmetics/equip",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      const { slot, cosmeticId } = request.body || {};
      try {
        const res = await useCase.equip({ userId: auth.actor.userId, slot, cosmeticId });
        return reply.code(200).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 3. Claim Pass Cosmetic
  app.post<{ Body: { rewardId: string; cosmeticId: string; fantasySeasonId: string } }>(
    "/api/cosmetics/claim-pass",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      const { rewardId, cosmeticId, fantasySeasonId } = request.body || {};
      try {
        const res = await useCase.claimPassCosmetic({ userId: auth.actor.userId, rewardId, cosmeticId, fantasySeasonId });
        return reply.code(200).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 4. Purchase Shop Item
  app.post<{ Body: { shopItemId: string; fantasySeasonId: string } }>(
    "/api/cosmetics/purchase-shop",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      const { shopItemId, fantasySeasonId } = request.body || {};
      try {
        const res = await useCase.purchaseShopItem({ userId: auth.actor.userId, shopItemId, fantasySeasonId });
        return reply.code(200).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 5. My Equipped
  app.get(
    "/api/cosmetics/equipped/me",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      try {
        const equipped = await useCase.getMyEquipped(auth.actor.userId);
        return reply.code(200).send(equipped);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 6. Player Equipped
  app.get<{ Params: { playerId: string } }>(
    "/api/cosmetics/equipped/players/:playerId",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      const { playerId } = request.params;
      try {
        const equipped = await useCase.getPlayerEquipped(playerId, auth.actor.userId);
        return reply.code(200).send(equipped);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 7. Players Map
  app.post<{ Body: { playerIds?: string[] } }>(
    "/api/cosmetics/equipped/players-map",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      const { playerIds } = request.body || {};
      try {
        const map = await useCase.getAllPlayersMap(playerIds, auth.actor.userId);
        return reply.code(200).send(map);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 8. Admin Preview
  app.post<{ Body: { playerId: string; requested: any } }>(
    "/api/cosmetics/admin-preview",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      const { playerId, requested } = request.body || {};
      try {
        const preview = await useCase.resolveAdminPreview({
          userId: auth.actor.userId,
          playerId,
          requested,
        });
        return reply.code(200).send(preview);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 9. Admin Cleanup Legacy
  app.post<{ Body: { fantasySeasonId?: string | null } }>(
    "/api/cosmetics/admin/cleanup-legacy",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      const { fantasySeasonId = null } = request.body || {};
      try {
        const res = await useCase.cleanupLegacyPreview(auth.actor.userId, fantasySeasonId);
        return reply.code(200).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 10. Admin Dismiss Bronze Pack
  app.post<{ Body: { fantasySeasonId?: string | null } }>(
    "/api/cosmetics/admin/dismiss-bronze-pack",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      const { fantasySeasonId = null } = request.body || {};
      try {
        const res = await useCase.dismissBronzePack(auth.actor.userId, fantasySeasonId);
        return reply.code(200).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );

  // 11. Admin Reset Test Claims
  app.post<{ Body: { fantasySeasonId: string; selectedFantasySeasonId?: string | null } }>(
    "/api/cosmetics/admin/reset-test-claims",
    async (request, reply) => {
      const auth = await authenticateBearer(request, options.userVerifier);
      if ("error" in auth) return reply.code(auth.error.statusCode).send(auth.error);

      const { fantasySeasonId, selectedFantasySeasonId = null } = request.body || {};
      try {
        const res = await useCase.resetTestClaims({ userId: auth.actor.userId, fantasySeasonId, selectedFantasySeasonId });
        return reply.code(200).send(res);
      } catch (err) {
        return sendFailure(err, request, reply);
      }
    }
  );
}
