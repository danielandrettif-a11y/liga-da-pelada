import type { Actor } from "../../../shared/actor.js";
import { buildAccountCareer, type AccountCareer, type AccountCareerRow } from "../domain/account-career.js";

export interface AccountCareerRepository {
  listForAccount(actor: Actor): Promise<AccountCareerRow[]>;
}

export async function getAccountCareer(
  actor: Actor,
  repository: AccountCareerRepository,
): Promise<AccountCareer> {
  return buildAccountCareer(await repository.listForAccount(actor));
}
