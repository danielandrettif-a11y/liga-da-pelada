import type { Actor } from "../../../shared/actor.js";
import { parseLeagueId } from "../domain/league.js";
import {
  parseStadiumId,
  parseStadiumInput,
  parseStadiumOrder,
  type Stadium,
  type StadiumInput,
} from "../domain/stadium.js";

export interface StadiumRepository {
  list(leagueId: string, actor: Actor): Promise<Stadium[]>;
  create(leagueId: string, input: StadiumInput, actor: Actor): Promise<Stadium>;
  update(leagueId: string, stadiumId: string, input: StadiumInput, actor: Actor): Promise<Stadium>;
  delete(leagueId: string, stadiumId: string, actor: Actor): Promise<void>;
  reorder(leagueId: string, stadiumIds: string[], actor: Actor): Promise<void>;
}

export function getStadiums(leagueId: string, actor: Actor, repository: StadiumRepository) {
  return repository.list(parseLeagueId(leagueId), actor);
}

export function saveStadium(
  leagueId: string,
  stadiumId: string | null,
  input: Parameters<typeof parseStadiumInput>[0],
  actor: Actor,
  repository: StadiumRepository,
) {
  const scope = parseLeagueId(leagueId);
  const stadium = parseStadiumInput(input);
  return stadiumId
    ? repository.update(scope, parseStadiumId(stadiumId), stadium, actor)
    : repository.create(scope, stadium, actor);
}

export async function deleteStadium(
  leagueId: string, stadiumId: string, actor: Actor, repository: StadiumRepository,
) {
  await repository.delete(parseLeagueId(leagueId), parseStadiumId(stadiumId), actor);
  return { deleted: true };
}

export async function reorderStadiums(
  leagueId: string, stadiumIds: string[], actor: Actor, repository: StadiumRepository,
) {
  await repository.reorder(parseLeagueId(leagueId), parseStadiumOrder(stadiumIds), actor);
  return { reordered: true };
}
