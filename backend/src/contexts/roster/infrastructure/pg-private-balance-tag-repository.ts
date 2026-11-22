import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type {
  PrivateBalanceTagRepository,
  PrivateBalanceTagView,
} from "../application/manage-private-balance-tag.js";
import {
  privateBalanceTags,
  type PrivateBalanceTag,
} from "../domain/private-balance-tag.js";

export class PrivateBalanceTagPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "PrivateBalanceTagPersistenceError";
  }
}

function translateFailure(cause: unknown): PrivateBalanceTagPersistenceError {
  if (cause instanceof PrivateBalanceTagPersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/PRIVATE_BALANCE_FORBIDDEN|permission denied|row-level security/i.test(message)) {
    return new PrivateBalanceTagPersistenceError("Somente o editor autorizado pode alterar esta classificação.", 403);
  }
  return new PrivateBalanceTagPersistenceError("Não foi possível acessar a classificação de equilíbrio.", 503);
}

async function canManage(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ allowed: boolean }>(
    "SELECT public.can_manage_private_balance_tags() AS allowed",
  );
  return result.rows[0]?.allowed === true;
}

export function pgPrivateBalanceTagRepository(pool: Pool): PrivateBalanceTagRepository {
  return {
    async get(playerId: string, actor: Actor): Promise<PrivateBalanceTagView> {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          if (!await canManage(client)) return { allowed: false, tag: null };
          const result = await client.query<{ balance_tag: string }>(
            "SELECT balance_tag FROM public.player_private_balance_tags WHERE player_id = $1::uuid",
            [playerId],
          );
          const value = result.rows[0]?.balance_tag;
          const tag = value && privateBalanceTags.includes(value as PrivateBalanceTag)
            ? value as PrivateBalanceTag
            : null;
          return { allowed: true, tag };
        });
      } catch (cause) {
        throw translateFailure(cause);
      }
    },

    async set(playerId: string, tag: PrivateBalanceTag | null, actor: Actor): Promise<void> {
      try {
        await withAuthenticatedTransaction(pool, actor, async (client) => {
          if (!await canManage(client)) throw new Error("PRIVATE_BALANCE_FORBIDDEN");
          if (tag === null) {
            await client.query("DELETE FROM public.player_private_balance_tags WHERE player_id = $1::uuid", [playerId]);
            return;
          }
          await client.query(
            `INSERT INTO public.player_private_balance_tags (player_id, balance_tag, updated_by, updated_at)
             VALUES ($1::uuid, $2::text, $3::uuid, now())
             ON CONFLICT (player_id) DO UPDATE SET
               balance_tag = EXCLUDED.balance_tag, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
            [playerId, tag, actor.userId],
          );
        });
      } catch (cause) {
        throw translateFailure(cause);
      }
    },
  };
}
