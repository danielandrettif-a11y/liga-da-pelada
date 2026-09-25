import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readManagerConfig } from "./config";
import { composedOverall } from "./engine";
import type { AthleteSource, ManagerSave, ManagerState } from "./types";

export function createManagerClient() {
  const config = readManagerConfig(process.env);
  return config ? createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

/** Fresh, authenticated, explicit allowlist. Never copies account/private fields. */
export async function readCatalog(appClient: SupabaseClient): Promise<AthleteSource[]> {
  const { data, error } = await appClient.rpc("get_manager_player_catalog");
  if (error) throw new Error("manager_catalog_unavailable");
  return (data || []).flatMap((row: Record<string, unknown>) => {
    const traits = Array.isArray(row.traits) ? row.traits.filter((trait): trait is "defensive" | "midfield" | "offensive" =>
      trait === "defensive" || trait === "midfield" || trait === "offensive") : [];
    const source: AthleteSource = {
      playerId: String(row.player_id), name: String(row.name),
      avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
      snapshotId: String(row.snapshot_id), formula: String(row.formula), capturedAt: String(row.captured_at),
      overall: Number(row.overall),
      positions: { DEF: Number(row.def_overall), ALA_MEI: Number(row.ala_mei_overall), ATA: Number(row.ata_overall), GOL: Number(row.gol_overall) },
      traits, goalkeeperEligible: row.goalkeeper_eligible === true,
      trend: row.trend === "rising" || row.trend === "falling" ? row.trend : "steady",
      stats: { rounds: Number(row.rounds), goals: Number(row.goals), assists: Number(row.assists) },
    };
    if (!traits.length || row.overall == null || !Number.isFinite(source.overall)
      || Object.values(source.positions).some(value => !Number.isFinite(value) || value < 40 || value > 99)) return [];
    // Current traits can have changed since last calculation; wait for a consistent snapshot.
    if (Math.abs(composedOverall(source, source.positions) - source.overall) > 0.11) return [];
    return [source];
  }).sort((a: AthleteSource, b: AthleteSource) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function readManagerSave(client: SupabaseClient, ownerId: string): Promise<ManagerSave | null> {
  const { data, error } = await client.from("manager_clubs").select("version, state").eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error("manager_storage_unavailable");
  if (!data) return null;
  if (data.state.schemaVersion !== 1) throw new Error("manager_schema_unsupported");
  return { version: data.version, state: data.state as ManagerState };
}
