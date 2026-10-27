import type { Actor } from "../../../shared/actor.js";
import {
  drawTeamsBySpeed,
  drawTeamsWithAttendance,
  InvalidSpeedDrawError,
  parseSpeedRating,
  parseSpeedUuid,
  type SpeedDrawPlayer,
  type SpeedDrawResult,
  type SpeedRating,
} from "../domain/speed-draw.js";

export interface SpeedRatingRepository {
  listRatings(leagueId: string, actor: Actor): Promise<Record<string, SpeedRating | null>>;
  listEligiblePlayers(leagueId: string, playerIds: string[], actor: Actor): Promise<SpeedDrawPlayer[]>;
  setRating(leagueId: string, playerId: string, rating: SpeedRating | null, actor: Actor): Promise<void>;
}

export async function getPlayerSpeedRatings(
  leagueId: string, actor: Actor, repository: SpeedRatingRepository,
): Promise<Record<string, SpeedRating | null>> {
  return repository.listRatings(parseSpeedUuid(leagueId, "Pelada"), actor);
}

export function setPlayerSpeedRating(
  leagueId: string,
  playerId: string,
  rating: unknown,
  actor: Actor,
  repository: SpeedRatingRepository,
): Promise<void> {
  return repository.setRating(
    parseSpeedUuid(leagueId, "Pelada"),
    parseSpeedUuid(playerId, "Jogador"),
    parseSpeedRating(rating),
    actor,
  );
}

export async function drawLeagueTeamsBySpeed(
  leagueId: string,
  command: { playerIds: string[]; attendanceOrder?: string[]; teamCount: number; playersPerTeam: number },
  actor: Actor,
  repository: SpeedRatingRepository,
): Promise<SpeedDrawResult> {
  const normalizedLeagueId = parseSpeedUuid(leagueId, "Pelada");
  const playerIds = [...new Set(command.playerIds.map((id) => parseSpeedUuid(id, "Jogador")))];
  const teamCount = Math.trunc(command.teamCount);
  const playersPerTeam = Math.trunc(command.playersPerTeam);
  if (teamCount < 2 || teamCount > 4 || playersPerTeam < 1 || playersPerTeam > 10) {
    throw new InvalidSpeedDrawError("Configuração de times inválida.");
  }
  if (!playerIds.length || playerIds.length > teamCount * playersPerTeam) {
    throw new InvalidSpeedDrawError("Quantidade de jogadores inválida para o sorteio.");
  }
  const players = await repository.listEligiblePlayers(normalizedLeagueId, playerIds, actor);
  const eligible = new Set(players.map((player) => player.id));
  if (eligible.size !== playerIds.length || playerIds.some((id) => !eligible.has(id))) {
    throw new InvalidSpeedDrawError("A lista contém uma pessoa que não está elegível nesta liga.");
  }
  const byId = new Map(players.map((player) => [player.id, player]));
  const orderedPlayers = playerIds.map((id) => byId.get(id)!);
  const requestedAttendance = [...new Set((command.attendanceOrder || [])
    .map((id) => parseSpeedUuid(id, "Jogador")))]
    .filter((id) => eligible.has(id));
  if (requestedAttendance.length) {
    const minimumPresent = Math.min(playerIds.length, playersPerTeam * 2);
    const fullOrder = requestedAttendance.length < minimumPresent
      ? [...requestedAttendance, ...playerIds.filter((id) => !requestedAttendance.includes(id))]
      : requestedAttendance;
    return drawTeamsWithAttendance({ players: orderedPlayers, attendanceOrder: fullOrder, teamCount, playersPerTeam });
  }
  return { ...drawTeamsBySpeed({ players: orderedPlayers, teamCount, playersPerTeam }), attendanceOrder: [] };
}
