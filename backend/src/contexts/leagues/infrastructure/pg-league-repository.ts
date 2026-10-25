import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { LeagueRepository } from "../application/create-league.js";
import type { NewLeague } from "../domain/league.js";

export class LeaguePersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "LeaguePersistenceError";
  }
}

export function pgLeagueRepository(pool: Pool): LeagueRepository {
  return {
    async create(league: NewLeague, actor: Actor): Promise<string> {
      const client = await pool.connect();
      let inTransaction = false;
      try {
        await client.query("BEGIN");
        inTransaction = true;
        await client.query("SET LOCAL ROLE authenticated");
        await client.query(
          "SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true)",
          [actor.userId, JSON.stringify({ sub: actor.userId, role: "authenticated" })],
        );
        const result = await client.query<{ league_id: string }>(
          "SELECT public.create_league_for_user($1::text, $2::text, $3::text) AS league_id",
          [league.name, league.tier, league.visibility],
        );
        const id = result.rows[0]?.league_id;
        if (!id) throw new Error("RPC sem identificador da pelada.");
        await client.query("COMMIT");
        inTransaction = false;
        return id;
      } catch (cause) {
        if (inTransaction) {
          try { await client.query("ROLLBACK"); } catch { /* conexão pode ter caído */ }
        }
        const error = cause as Error & { code?: string };
        if (error.code === "23505") throw new LeaguePersistenceError("Já existe uma pelada com esse nome.", 409);
        if (/Complete seu perfil de jogador/i.test(error.message)) {
          throw new LeaguePersistenceError("Complete seu perfil de jogador antes de criar uma pelada.", 422);
        }
        throw new LeaguePersistenceError("Não foi possível criar a pelada.", 503);
      } finally {
        client.release();
      }
    },
  };
}
