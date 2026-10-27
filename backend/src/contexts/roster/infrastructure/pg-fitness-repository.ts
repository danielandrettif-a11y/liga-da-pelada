import type { Pool, PoolClient } from "pg";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { Actor } from "../../../shared/actor.js";
import type { FitnessRepository } from "../application/manage-fitness.js";
import type {
  FitnessMeasurement,
  FitnessRoundEntry,
  FitnessRoundType,
  PlayerRoundFitness,
} from "../domain/fitness.js";

export class FitnessPersistenceError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "FitnessPersistenceError";
  }
}

function translateFailure(cause: unknown): FitnessPersistenceError {
  if (cause instanceof FitnessPersistenceError) return cause;
  const message = cause instanceof Error ? cause.message : "";
  if (/FITNESS_ACCOUNT_UNLINKED/i.test(message)) {
    return new FitnessPersistenceError("Conta sem jogador vinculado.", 409);
  }
  if (/FITNESS_FORBIDDEN|permission denied|row-level security/i.test(message)) {
    return new FitnessPersistenceError("Você não pode alterar os dados físicos desta rodada.", 403);
  }
  return new FitnessPersistenceError("Não foi possível acessar os dados físicos.", 503);
}

async function authenticated<T>(
  pool: Pool,
  actor: Actor,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  try {
    return await withAuthenticatedTransaction(pool, actor, operation);
  } catch (cause) {
    throw translateFailure(cause);
  }
}

async function ownPlayerId(client: PoolClient): Promise<string | null> {
  const result = await client.query<{ player_id: string | null }>(
    "SELECT player_id FROM public.account_profiles WHERE user_id = auth.uid()",
  );
  return result.rows[0]?.player_id || null;
}

type RawRoundEntry = {
  round_id: string;
  number: number;
  date: string | Date;
  round_type: string;
  fitness_id: string | null;
  distance_km: string | number | null;
  average_speed_kmh: string | number | null;
  fitness_created_at: string | Date | null;
  fitness_updated_at: string | Date | null;
};

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dateOnly(value: string | Date): string {
  return iso(value).slice(0, 10);
}

function roundType(value: string): FitnessRoundType {
  if (value !== "official" && value !== "friendly") throw new Error("Tipo de rodada inválido.");
  return value;
}

function mapRoundEntry(row: RawRoundEntry, playerId: string): FitnessRoundEntry {
  let fitness: PlayerRoundFitness | null = null;
  if (row.fitness_id) {
    if (row.distance_km === null || row.average_speed_kmh === null
      || !row.fitness_created_at || !row.fitness_updated_at) throw new Error("Registro físico incompleto.");
    fitness = {
      id: row.fitness_id,
      player_id: playerId,
      round_id: row.round_id,
      distance_km: Number(row.distance_km),
      average_speed_kmh: Number(row.average_speed_kmh),
      created_at: iso(row.fitness_created_at),
      updated_at: iso(row.fitness_updated_at),
    };
  }
  return {
    roundId: row.round_id,
    number: Number(row.number),
    date: dateOnly(row.date),
    roundType: roundType(row.round_type),
    fitness,
  };
}

export function pgFitnessRepository(pool: Pool): FitnessRepository {
  return {
    listMyRounds: (playerId, leagueId, actor) => authenticated(pool, actor, async (client) => {
      const ownerId = await ownPlayerId(client);
      if (ownerId !== playerId) return [];
      const result = await client.query<RawRoundEntry>(
        `SELECT round_item.id AS round_id, round_item.number, round_item.date, round_item.round_type,
                fitness.id AS fitness_id, fitness.distance_km, fitness.average_speed_kmh,
                fitness.created_at AS fitness_created_at, fitness.updated_at AS fitness_updated_at
           FROM public.round_players participant
           JOIN public.rounds round_item ON round_item.id = participant.round_id
           JOIN public.seasons season ON season.id = round_item.season_id
           LEFT JOIN public.player_round_fitness fitness
             ON fitness.round_id = round_item.id AND fitness.player_id = participant.player_id
          WHERE participant.player_id = $1::uuid
            AND season.league_id = $2::uuid AND season.status = 'active'
            AND round_item.status = 'finished'
          ORDER BY round_item.date DESC, round_item.number DESC`,
        [playerId, leagueId],
      );
      return result.rows.map((row) => mapRoundEntry(row, playerId));
    }),

    saveMyFitness: (roundId, distanceKm, averageSpeedKmh, actor) => authenticated(pool, actor, async (client) => {
      const playerId = await ownPlayerId(client);
      if (!playerId) throw new Error("FITNESS_ACCOUNT_UNLINKED");
      const access = await client.query<{ allowed: boolean }>(
        "SELECT public.can_manage_own_fitness($1::uuid, $2::uuid) AS allowed",
        [playerId, roundId],
      );
      if (access.rows[0]?.allowed !== true) throw new Error("FITNESS_FORBIDDEN");
      await client.query(
        `INSERT INTO public.player_round_fitness
           (player_id, round_id, distance_km, average_speed_kmh, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::numeric, $4::numeric, now())
         ON CONFLICT (player_id, round_id) DO UPDATE SET
           distance_km = EXCLUDED.distance_km,
           average_speed_kmh = EXCLUDED.average_speed_kmh,
           updated_at = EXCLUDED.updated_at`,
        [playerId, roundId, distanceKm, averageSpeedKmh],
      );
      return playerId;
    }),

    setMyVisibility: (visible, actor) => authenticated(pool, actor, async (client) => {
      const playerId = await ownPlayerId(client);
      if (!playerId) throw new Error("FITNESS_ACCOUNT_UNLINKED");
      const result = await client.query<{ id: string }>(
        "UPDATE public.players SET show_fitness_stats = $2::boolean WHERE id = $1::uuid RETURNING id",
        [playerId, visible],
      );
      if (!result.rows[0]) throw new Error("FITNESS_ACCOUNT_UNLINKED");
      return result.rows[0].id;
    }),

    listSummaryMeasurements: (playerId, leagueId, actor) => authenticated(pool, actor, async (client) => {
      const visibility = await client.query<{ show_fitness_stats: boolean; owns: boolean }>(
        `SELECT player.show_fitness_stats,
                EXISTS (SELECT 1 FROM public.account_profiles profile
                  WHERE profile.user_id = auth.uid() AND profile.player_id = player.id) AS owns
           FROM public.players player WHERE player.id = $1::uuid`,
        [playerId],
      );
      const target = visibility.rows[0];
      if (!target || (!target.show_fitness_stats && !target.owns)) return null;
      const result = await client.query<{
        round_type: string; distance_km: string | number; average_speed_kmh: string | number;
      }>(
        `SELECT round_item.round_type, fitness.distance_km, fitness.average_speed_kmh
           FROM public.player_round_fitness fitness
           JOIN public.rounds round_item ON round_item.id = fitness.round_id
           JOIN public.seasons season ON season.id = round_item.season_id
          WHERE fitness.player_id = $1::uuid
            AND season.league_id = $2::uuid AND season.status = 'active'`,
        [playerId, leagueId],
      );
      return result.rows.map((row): FitnessMeasurement => ({
        roundType: roundType(row.round_type),
        distanceKm: Number(row.distance_km),
        averageSpeedKmh: Number(row.average_speed_kmh),
      }));
    }),
  };
}
