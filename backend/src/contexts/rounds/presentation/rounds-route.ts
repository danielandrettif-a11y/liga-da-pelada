import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserVerifier } from "../../../infrastructure/auth-user-verifier.js";
import { authenticateBearer } from "../../../presentation/authenticate-bearer.js";
import {
  createRoundWithTeams,
  deleteRound,
  finishRound,
  getActiveLeague,
  getAdminRoundPrelist,
  getAdminRoundPrelists,
  getRound,
  getRoundMatchSetup,
  getRounds,
  saveRoundPrelist,
  type RoundRepository,
} from "../application/manage-rounds.js";
import { InvalidRoundError } from "../domain/round.js";
import { RoundPersistenceError } from "../infrastructure/pg-round-repository.js";

function sendFailure(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof InvalidRoundError) {
    return reply.code(400).send({ code: "INVALID_ROUND_REQUEST", message: error.message });
  }
  if (error instanceof RoundPersistenceError) {
    return reply.code(error.statusCode).send({ code: "ROUND_PERSISTENCE_ERROR", message: error.message });
  }
  request.log.error({ err: error }, "round operation failed");
  return reply.code(500).send({ code: "ROUND_SERVER_ERROR", message: "Erro no servidor de rodadas." });
}

export function registerRoundRoutes(app: FastifyInstance, dependencies: {
  verifier: UserVerifier;
  repository: RoundRepository;
}): void {
  // Lista rodadas de uma temporada
  app.get<{ Params: { seasonId: string } }>(
    "/api/rounds/seasons/:seasonId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const rounds = await getRounds(request.params.seasonId, authentication.actor, dependencies.repository);
        return reply.code(200).send(rounds);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Busca rodada por id
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/rounds/leagues/:leagueId/:roundId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const round = await getRound(request.params.roundId, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(round);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Match setup da rodada
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/rounds/leagues/:leagueId/:roundId/match-setup",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const setup = await getRoundMatchSetup(request.params.roundId, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(setup);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Informações ativas da pelada
  app.get<{ Params: { leagueId: string } }>(
    "/api/rounds/leagues/:leagueId/active-league",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const league = await getActiveLeague(request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(league);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Criar rodada com times
  app.post<{
    Params: { leagueId: string };
    Body: Parameters<typeof createRoundWithTeams>[0];
  }>(
    "/api/rounds/leagues/:leagueId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await createRoundWithTeams(request.body, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(201).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Deletar rodada
  app.delete<{ Params: { leagueId: string; roundId: string } }>(
    "/api/rounds/leagues/:leagueId/:roundId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await deleteRound(request.params.roundId, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Finalizar rodada
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { bestGoalkeeperPlayerId?: string | null };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/finish",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await finishRound(
          request.params.roundId,
          request.params.leagueId,
          request.body?.bestGoalkeeperPlayerId || null,
          authentication.actor,
          dependencies.repository,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Pré-lista individual
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/rounds/leagues/:leagueId/:roundId/prelist",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const prelist = await getAdminRoundPrelist(request.params.roundId, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(prelist);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Pré-listas da pelada
  app.get<{ Params: { leagueId: string } }>(
    "/api/rounds/leagues/:leagueId/prelists",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const prelists = await getAdminRoundPrelists(request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(prelists);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Salvar pré-lista
  app.post<{
    Params: { leagueId: string };
    Body: Parameters<typeof saveRoundPrelist>[0];
  }>(
    "/api/rounds/leagues/:leagueId/prelist",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await saveRoundPrelist(request.body, request.params.leagueId, authentication.actor, dependencies.repository);
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Formato da convocação
  app.patch<{
    Params: { leagueId: string; callupId: string };
    Body: { playersPerTeam: number; teamsPerRound: number };
  }>(
    "/api/rounds/leagues/:leagueId/callups/:callupId/format",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await dependencies.repository.setCallupFormat(
          request.params.callupId,
          request.params.leagueId,
          request.body,
          authentication.actor,
        );
        return reply.code(200).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Tamanho do jogo da convocação
  app.patch<{
    Params: { leagueId: string; callupId: string };
    Body: { playersPerTeam: number };
  }>(
    "/api/rounds/leagues/:leagueId/callups/:callupId/match-size",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.setCallupMatchSize(
          request.params.callupId,
          request.params.leagueId,
          request.body,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Próximo offset de presets de times
  app.get<{ Params: { leagueId: string } }>(
    "/api/rounds/leagues/:leagueId/next-team-preset-offset",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const offset = await dependencies.repository.getNextTeamPresetOffset(request.params.leagueId, authentication.actor);
        return reply.code(200).send(offset);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Time chegou
  app.post<{
    Params: { leagueId: string; roundId: string; teamId: string };
    Body: { arrived: boolean };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/teams/:teamId/arrived",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.markRoundTeamArrived(
          request.params.roundId,
          request.params.teamId,
          request.params.leagueId,
          Boolean(request.body?.arrived),
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Abrir vaga de reposição
  app.post<{ Params: { leagueId: string; callupId: string } }>(
    "/api/rounds/leagues/:leagueId/callups/:callupId/open-vacancy",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.openCallupReplacementVacancy(
          request.params.callupId,
          request.params.leagueId,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Sorteio: preview
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { mode: string };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/shuffle/preview",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const preview = await dependencies.repository.previewRoundTeamShuffle(
          request.params.roundId,
          request.params.leagueId,
          request.body?.mode || "standard",
          authentication.actor,
        );
        return reply.code(200).send(preview);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Sorteio: aplicar
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { mode: string };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/shuffle/apply",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.applyRoundTeamShuffle(
          request.params.roundId,
          request.params.leagueId,
          request.body?.mode || "standard",
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Formação permanente de times
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { teams: Array<{ teamId: string; playerIds: string[]; captainPlayerId?: string | null }> };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/permanent-formation",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.applyPermanentRoundTeamFormation(
          request.params.roundId,
          request.params.leagueId,
          request.body,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Trocar jogadores de time
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { playerA: string; playerB: string };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/swap-players",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.swapRoundTeamPlayers(
          request.params.roundId,
          request.params.leagueId,
          request.body.playerA,
          request.body.playerB,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Presença em massa
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { playerIds: string[] };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/attendance/bulk",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.setRoundAttendanceBulk(
          request.params.roundId,
          request.params.leagueId,
          request.body.playerIds || [],
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Presença individual
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { playerId: string; present: boolean };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/attendance",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.setRoundPlayerAttendance(
          request.params.roundId,
          request.params.leagueId,
          request.body.playerId,
          Boolean(request.body.present),
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Disponibilidade médica/lesão
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { playerId: string; status: "available" | "injured" };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/availability",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.setRoundPlayerAvailability(
          request.params.roundId,
          request.params.leagueId,
          request.body.playerId,
          request.body.status,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Capitão do time
  app.post<{
    Params: { leagueId: string; roundId: string; teamId: string };
    Body: { captainPlayerId?: string | null };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/teams/:teamId/captain",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.setRoundTeamCaptain(
          request.params.roundId,
          request.params.teamId,
          request.params.leagueId,
          request.body?.captainPlayerId || null,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Cor do colete
  app.post<{
    Params: { leagueId: string; roundId: string; teamId: string };
    Body: { color: string };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/teams/:teamId/vest-color",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.setRoundTeamVestColor(
          request.params.roundId,
          request.params.teamId,
          request.params.leagueId,
          request.body.color,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Transferência de identidade de jogador na rodada
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { fromId: string; toId: string };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/transfer-identity",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.transferRoundPlayerIdentity(
          request.params.roundId,
          request.params.leagueId,
          request.body.fromId,
          request.body.toId,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Zerar pontos do atleta na rodada
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { playerId: string };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/zero-points",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.zeroPlayerRoundPoints(
          request.params.roundId,
          request.params.leagueId,
          request.body.playerId,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Substituto emergencial
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { name: string; teamId: string };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/emergency-substitute",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await dependencies.repository.addRoundEmergencySubstitute(
          request.params.roundId,
          request.params.leagueId,
          request.body,
          authentication.actor,
        );
        return reply.code(201).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // DRAFT: Criar
  app.post<{
    Params: { leagueId: string; roundId: string };
    Body: { callupId?: string | null };
  }>(
    "/api/rounds/leagues/:leagueId/:roundId/draft",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await dependencies.repository.createTeamDraft(
          request.params.roundId,
          request.body?.callupId || null,
          request.params.leagueId,
          authentication.actor,
        );
        return reply.code(201).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // DRAFT: Workspace por draftId
  app.get<{ Params: { leagueId: string; draftId: string } }>(
    "/api/rounds/leagues/:leagueId/drafts/:draftId",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const ws = await dependencies.repository.getDraftWorkspace(
          request.params.draftId,
          request.params.leagueId,
          authentication.actor,
        );
        return reply.code(200).send(ws);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // DRAFT: Workspace por roundId
  app.get<{ Params: { leagueId: string; roundId: string } }>(
    "/api/rounds/leagues/:leagueId/:roundId/draft-workspace",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const ws = await dependencies.repository.getDraftWorkspaceByRound(
          request.params.roundId,
          request.params.leagueId,
          authentication.actor,
        );
        return reply.code(200).send(ws);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // DRAFT: Iniciar
  app.post<{ Params: { leagueId: string; draftId: string } }>(
    "/api/rounds/leagues/:leagueId/drafts/:draftId/start",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.startTeamDraft(
          request.params.draftId,
          request.params.leagueId,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // DRAFT: Pick
  app.post<{
    Params: { leagueId: string; draftId: string };
    Body: { playerId: string };
  }>(
    "/api/rounds/leagues/:leagueId/drafts/:draftId/pick",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.makeTeamDraftPick(
          request.params.draftId,
          request.params.leagueId,
          request.body.playerId,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // DRAFT: Substituir Capitão
  app.post<{
    Params: { leagueId: string; draftId: string };
    Body: { teamSlot: number; newCaptainId: string };
  }>(
    "/api/rounds/leagues/:leagueId/drafts/:draftId/replace-captain",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.replaceTeamDraftCaptain(
          request.params.draftId,
          request.params.leagueId,
          Number(request.body.teamSlot),
          request.body.newCaptainId,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // DRAFT: Reiniciar
  app.post<{ Params: { leagueId: string; draftId: string } }>(
    "/api/rounds/leagues/:leagueId/drafts/:draftId/restart",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.restartTeamDraft(
          request.params.draftId,
          request.params.leagueId,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // DRAFT: Finalizar
  app.post<{ Params: { leagueId: string; draftId: string } }>(
    "/api/rounds/leagues/:leagueId/drafts/:draftId/finalize",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await dependencies.repository.finalizeTeamDraft(
          request.params.draftId,
          request.params.leagueId,
          authentication.actor,
        );
        return reply.code(200).send({ success: true, ...result });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // DRAFT: Troca entre atletas no Draft
  app.post<{
    Params: { leagueId: string; draftId: string };
    Body: { playerAId: string; playerBId: string };
  }>(
    "/api/rounds/leagues/:leagueId/drafts/:draftId/swap",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        await dependencies.repository.applyDraftSwap(
          request.params.draftId,
          request.params.leagueId,
          request.body.playerAId,
          request.body.playerBId,
          authentication.actor,
        );
        return reply.code(200).send({ success: true });
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );

  // Sorteio adaptativo no servidor
  app.post<{
    Params: { leagueId: string };
    Body: {
      playerIds: string[];
      attendanceOrder?: string[];
      teamCount: number;
      playersPerTeam: number;
    };
  }>(
    "/api/rounds/leagues/:leagueId/adaptive-draw",
    async (request, reply) => {
      const authentication = await authenticateBearer(request, dependencies.verifier);
      if ("error" in authentication) return reply.code(authentication.error.statusCode).send(authentication.error);
      try {
        const result = await dependencies.repository.drawTeamsAdaptiveOnServer(
          request.body,
          request.params.leagueId,
          authentication.actor,
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendFailure(error, request, reply);
      }
    },
  );
}
