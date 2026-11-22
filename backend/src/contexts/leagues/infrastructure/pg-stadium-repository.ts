import type { Pool, PoolClient } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { StadiumRepository } from "../application/manage-stadiums.js";
import type { Stadium, StadiumInput } from "../domain/stadium.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";

export class StadiumPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "StadiumPersistenceError";
  }
}

type RawStadium = Omit<Stadium, "created_at" | "updated_at"> & {
  created_at: string | Date;
  updated_at: string | Date;
};

function mapStadium(row: RawStadium): Stadium {
  return {
    ...row,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
  };
}

function translate(cause: unknown): StadiumPersistenceError {
  const error = cause as Error & { code?: string };
  if (/STADIUM_FORBIDDEN|permission denied|row-level security/i.test(error.message)) {
    return new StadiumPersistenceError("Somente administradores desta pelada podem gerenciar estádios.", 403);
  }
  if (/STADIUM_NOT_FOUND/i.test(error.message)) {
    return new StadiumPersistenceError("Estádio não encontrado nesta pelada.", 404);
  }
  if (error.code === "23503") {
    return new StadiumPersistenceError("O estádio ainda está vinculado a outros registros.", 409);
  }
  return new StadiumPersistenceError("Não foi possível atualizar os estádios.", 503);
}

async function authenticated<T>(pool: Pool, actor: Actor, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  try {
    return await withAuthenticatedTransaction(pool, actor, operation);
  } catch (cause) {
    if (cause instanceof StadiumPersistenceError) throw cause;
    throw translate(cause);
  }
}

async function assertAdmin(client: PoolClient, leagueId: string): Promise<void> {
  const result = await client.query<{ allowed: boolean }>(
    "SELECT public.is_league_admin($1::uuid) AS allowed", [leagueId],
  );
  if (result.rows[0]?.allowed !== true) throw new Error("STADIUM_FORBIDDEN");
}

const fields = `id, league_id, name, address, google_maps_url, latitude, longitude,
  display_order, is_active, created_at, updated_at`;

export function pgStadiumRepository(pool: Pool): StadiumRepository {
  return {
    list: (leagueId, actor) => authenticated(pool, actor, async (client) => {
      const result = await client.query<RawStadium>(
        `SELECT ${fields} FROM public.stadiums
          WHERE league_id = $1::uuid AND is_active
          ORDER BY display_order ASC, created_at ASC`,
        [leagueId],
      );
      return result.rows.map(mapStadium);
    }),

    create: (leagueId, input: StadiumInput, actor) => authenticated(pool, actor, async (client) => {
      await assertAdmin(client, leagueId);
      await client.query("SELECT id FROM public.leagues WHERE id = $1::uuid FOR UPDATE", [leagueId]);
      const result = await client.query<RawStadium>(
        `INSERT INTO public.stadiums (
           league_id, name, address, google_maps_url, latitude, longitude, display_order, is_active
         ) VALUES (
           $1::uuid, $2::text, $3::text, $4::text, $5::double precision, $6::double precision,
           COALESCE((SELECT max(display_order) + 1 FROM public.stadiums WHERE league_id = $1::uuid), 1), true
         ) RETURNING ${fields}`,
        [leagueId, input.name, input.address, input.googleMapsUrl, input.latitude, input.longitude],
      );
      const saved = result.rows[0];
      if (!saved) throw new Error("STADIUM_NOT_FOUND");
      return mapStadium(saved);
    }),

    update: (leagueId, stadiumId, input: StadiumInput, actor) => authenticated(pool, actor, async (client) => {
      await assertAdmin(client, leagueId);
      const result = await client.query<RawStadium>(
        `UPDATE public.stadiums
            SET name = $3::text, address = $4::text, google_maps_url = $5::text,
                latitude = $6::double precision, longitude = $7::double precision, updated_at = now()
          WHERE league_id = $1::uuid AND id = $2::uuid
          RETURNING ${fields}`,
        [leagueId, stadiumId, input.name, input.address, input.googleMapsUrl, input.latitude, input.longitude],
      );
      const saved = result.rows[0];
      if (!saved) throw new Error("STADIUM_NOT_FOUND");
      return mapStadium(saved);
    }),

    delete: (leagueId, stadiumId, actor) => authenticated(pool, actor, async (client) => {
      await assertAdmin(client, leagueId);
      const result = await client.query<{ id: string }>(
        "DELETE FROM public.stadiums WHERE league_id = $1::uuid AND id = $2::uuid RETURNING id",
        [leagueId, stadiumId],
      );
      if (!result.rows[0]) throw new Error("STADIUM_NOT_FOUND");
    }),

    reorder: (leagueId, stadiumIds, actor) => authenticated(pool, actor, async (client) => {
      await assertAdmin(client, leagueId);
      if (stadiumIds.length === 0) return;
      const result = await client.query<{ id: string }>(
        `WITH requested AS (
           SELECT id, position::integer FROM unnest($2::uuid[]) WITH ORDINALITY AS item(id, position)
         )
         UPDATE public.stadiums stadium
            SET display_order = requested.position, updated_at = now()
           FROM requested
          WHERE stadium.league_id = $1::uuid AND stadium.id = requested.id
          RETURNING stadium.id`,
        [leagueId, stadiumIds],
      );
      if (result.rows.length !== stadiumIds.length) throw new Error("STADIUM_NOT_FOUND");
    }),
  };
}
