import type { Actor } from "../../../shared/actor.js";
import { accountRole, parseAccountId, type AccountRole, type ManagedAccount } from "../domain/account-access.js";

export interface AccountAccessRepository {
  list(actor: Actor): Promise<ManagedAccount[]>;
  setRole(targetUserId: string, role: AccountRole, actor: Actor): Promise<AccountRole>;
}

export function listManagedAccounts(actor: Actor, repository: AccountAccessRepository): Promise<ManagedAccount[]> {
  return repository.list(actor);
}

export function setManagedAccountRole(
  targetUserId: string,
  makeAdmin: boolean,
  actor: Actor,
  repository: AccountAccessRepository,
): Promise<AccountRole> {
  return repository.setRole(parseAccountId(targetUserId), accountRole(makeAdmin), actor);
}
