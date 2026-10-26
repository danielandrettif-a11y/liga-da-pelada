import type { Pool } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { IdentityProfileRepository } from "../application/manage-authentication.js";

export class IdentityProfilePersistenceError extends Error {
  constructor(message = "Não foi possível concluir o perfil da conta.") {
    super(message);
    this.name = "IdentityProfilePersistenceError";
  }
}

export function pgIdentityProfileRepository(pool: Pool): IdentityProfileRepository {
  return {
    async ensureProfile(actor: Actor) {
      try {
        await withAuthenticatedTransaction(pool, actor, async (client) => {
          await client.query("SELECT public.ensure_my_player_account()");
        });
      } catch {
        throw new IdentityProfilePersistenceError();
      }
    },
  };
}
