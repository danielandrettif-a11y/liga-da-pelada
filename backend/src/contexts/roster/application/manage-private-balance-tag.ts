import type { Actor } from "../../../shared/actor.js";
import {
  parsePlayerId,
  parsePrivateBalanceTag,
  type PrivateBalanceTag,
} from "../domain/private-balance-tag.js";

export type PrivateBalanceTagView = { allowed: boolean; tag: PrivateBalanceTag | null };

export interface PrivateBalanceTagRepository {
  get(playerId: string, actor: Actor): Promise<PrivateBalanceTagView>;
  set(playerId: string, tag: PrivateBalanceTag | null, actor: Actor): Promise<void>;
}

export function getPrivateBalanceTag(
  playerId: string,
  actor: Actor,
  repository: PrivateBalanceTagRepository,
): Promise<PrivateBalanceTagView> {
  return repository.get(parsePlayerId(playerId), actor);
}

export async function setPrivateBalanceTag(
  playerId: string,
  tag: unknown,
  actor: Actor,
  repository: PrivateBalanceTagRepository,
): Promise<void> {
  await repository.set(parsePlayerId(playerId), parsePrivateBalanceTag(tag), actor);
}
