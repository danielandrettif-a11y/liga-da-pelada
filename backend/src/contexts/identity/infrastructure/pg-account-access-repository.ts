import type { Pool } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { AccountAccessRepository } from "../application/manage-account-access.js";
import type { AccountRole, ManagedAccount } from "../domain/account-access.js";

type AccountRow = {
  user_id: string;
  role: string;
  created_at: Date | string;
  player_id: string | null;
  player_name: string | null;
  player_nickname: string | null;
  player_avatar_url: string | null;
};

export class AccountAccessPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "AccountAccessPersistenceError";
  }
}

function translateFailure(cause: unknown): AccountAccessPersistenceError {
  const message = cause instanceof Error ? cause.message : "";
  if (/Somente administradores/i.test(message)) {
    return new AccountAccessPersistenceError("Somente administradores podem alterar acessos.", 403);
  }
  if (/nao encontrada|não encontrada/i.test(message)) {
    return new AccountAccessPersistenceError("Conta cadastrada não encontrada.", 404);
  }
  if (/proprio acesso|próprio acesso|pelo menos um administrador/i.test(message)) {
    return new AccountAccessPersistenceError(message, 409);
  }
  if (/admin_role_audit_previous_role_check/i.test(message)) {
    return new AccountAccessPersistenceError(
      "A correção de contas antigas ainda não foi aplicada. Execute a migration 036.", 409,
    );
  }
  if (/list_manageable_accounts|manage_account_admin_role|does not exist/i.test(message)) {
    return new AccountAccessPersistenceError("As migrations de gestão de acesso ainda não foram aplicadas.", 503);
  }
  return new AccountAccessPersistenceError("Não foi possível atualizar os acessos.", 503);
}

function mapAccount(row: AccountRow): ManagedAccount {
  return {
    userId: row.user_id,
    role: row.role === "admin" ? "admin" : "player",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    player: row.player_id ? {
      id: row.player_id,
      name: row.player_name || "Jogador",
      nickname: row.player_nickname,
      avatarUrl: row.player_avatar_url,
    } : null,
  };
}

export function pgAccountAccessRepository(pool: Pool): AccountAccessRepository {
  return {
    async list(actor: Actor) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          const result = await client.query<AccountRow>("SELECT * FROM public.list_manageable_accounts()");
          return result.rows.map(mapAccount);
        });
      } catch (error) {
        throw translateFailure(error);
      }
    },
    async setRole(targetUserId: string, role: AccountRole, actor: Actor) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          const result = await client.query<{ role: string }>(
            "SELECT public.manage_account_admin_role($1::uuid, $2::boolean) AS role",
            [targetUserId, role === "admin"],
          );
          return result.rows[0]?.role === "admin" ? "admin" : "player";
        });
      } catch (error) {
        throw translateFailure(error);
      }
    },
  };
}
