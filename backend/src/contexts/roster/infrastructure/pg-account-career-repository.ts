import type { Pool } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { AccountCareerRepository } from "../application/get-account-career.js";
import type { AccountCareerRow, CareerRoundType, CareerTotals } from "../domain/account-career.js";

export class AccountCareerPersistenceError extends Error {
  constructor(message = "Não foi possível carregar a carreira da conta.") {
    super(message);
    this.name = "AccountCareerPersistenceError";
  }
}

type RawCareerRow = Omit<AccountCareerRow, keyof CareerTotals | "round_type"> & {
  round_type: string;
} & Record<keyof CareerTotals, string | number>;

const numericFields = [
  "rounds_count", "games", "goals", "assists", "wins", "draws", "losses", "points",
  "goalkeeper_games", "goals_conceded", "clean_sheets", "play_seconds",
] as const satisfies readonly (keyof CareerTotals)[];

function mapRow(row: RawCareerRow): AccountCareerRow {
  if (row.round_type !== "official" && row.round_type !== "friendly") {
    throw new Error("Tipo de rodada inválido na carreira.");
  }
  const mapped = {
    league_id: row.league_id,
    league_name: row.league_name,
    round_type: row.round_type as CareerRoundType,
  } as AccountCareerRow;
  for (const field of numericFields) {
    const value = Number(row[field]);
    if (!Number.isFinite(value) || value < 0) throw new Error("Total inválido na carreira.");
    mapped[field] = value;
  }
  return mapped;
}

export function pgAccountCareerRepository(pool: Pool): AccountCareerRepository {
  return {
    async listForAccount(actor: Actor) {
      try {
        return await withAuthenticatedTransaction(pool, actor, async (client) => {
          const result = await client.query<RawCareerRow>("SELECT * FROM public.get_my_account_career_stats()");
          return result.rows.map(mapRow);
        });
      } catch {
        throw new AccountCareerPersistenceError();
      }
    },
  };
}
