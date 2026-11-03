import { randomInt, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import { withAuthenticatedTransaction } from "../../../infrastructure/authenticated-transaction.js";
import type { ManagerRepository } from "../application/manage-manager.js";
import {
  composedOverall, executeCommand, ManagerRuleError, newManagerState,
  type AthleteSource, type ClubIdentity, type ManagerCommand, type ManagerResult, type ManagerSave, type ManagerState,
} from "../domain/manager.js";

export interface ManagerStore {
  read(ownerId: string): Promise<ManagerSave | null>;
  create(ownerId: string, state: ManagerState): Promise<{ save: ManagerSave; created: boolean }>;
  commit(ownerId: string, version: number, state: ManagerState, kind: string, details: unknown): Promise<number>;
}

class ManagerStoreError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export class SupabaseManagerStore implements ManagerStore {
  private readonly baseUrl: string;
  constructor(url: string, private readonly serviceRoleKey: string, private readonly fetcher: typeof fetch = fetch) {
    this.baseUrl = url.replace(/\/+$/, "");
  }
  private headers(prefer?: string) {
    const headers = new Headers({ apikey: this.serviceRoleKey, Authorization: `Bearer ${this.serviceRoleKey}`, "Content-Type": "application/json" });
    if (prefer) headers.set("Prefer", prefer);
    return headers;
  }
  async read(ownerId: string): Promise<ManagerSave | null> {
    const response = await this.fetcher(`${this.baseUrl}/rest/v1/manager_clubs?owner_id=eq.${encodeURIComponent(ownerId)}&select=version,state`, { headers: this.headers() });
    if (!response.ok) throw new ManagerStoreError("manager_storage_unavailable");
    const rows = await response.json() as Array<{ version: number; state: ManagerState }>;
    if (!rows[0]) return null;
    if (rows[0].state?.schemaVersion !== 1) throw new ManagerStoreError("manager_schema_unsupported");
    return { version: Number(rows[0].version), state: rows[0].state };
  }
  async create(ownerId: string, state: ManagerState) {
    const response = await this.fetcher(`${this.baseUrl}/rest/v1/manager_clubs`, {
      method: "POST", headers: this.headers("return=minimal"), body: JSON.stringify({ owner_id: ownerId, state }),
    });
    const created = response.ok;
    if (!created && response.status !== 409) throw new ManagerStoreError("manager_create_failed");
    const save = await this.read(ownerId);
    if (!save) throw new ManagerStoreError("manager_create_failed");
    return { save, created };
  }
  async commit(ownerId: string, version: number, state: ManagerState, kind: string, details: unknown) {
    const response = await this.fetcher(`${this.baseUrl}/rest/v1/rpc/manager_commit`, {
      method: "POST", headers: this.headers(), body: JSON.stringify({ p_owner: ownerId, p_version: version, p_state: state, p_kind: kind, p_details: details }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { code?: string; message?: string };
      if (body.code === "40001" || body.message?.includes("manager_conflict")) throw new ManagerStoreError("manager_conflict");
      throw new ManagerStoreError("manager_commit_failed");
    }
    return Number(await response.json());
  }
}

export function managerStoreFromEnvironment(env: NodeJS.ProcessEnv): ManagerStore | null {
  const url = env.BQ_MANAGER_SUPABASE_URL?.trim(), key = env.BQ_MANAGER_SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? new SupabaseManagerStore(url, key) : null;
}

export class PgManagerRepository implements ManagerRepository {
  constructor(
    private readonly pool: Pool,
    private readonly store: ManagerStore | null,
    private readonly clock: () => Date = () => new Date(),
    private readonly newId: () => string = randomUUID,
    private readonly random: () => number = () => randomInt(0, 2 ** 48 - 1) / (2 ** 48 - 1),
  ) {}

  async createClub(actor: Actor, leagueId: string, identity: ClubIdentity): Promise<ManagerResult> {
    try {
      if (!await this.authorize(actor, leagueId)) return { ok: false, message: "Selecione a pelada BQ para acessar esta carreira." };
      if (!this.store) return { ok: false, message: "A carreira ainda está em preparação. Experimente a demonstração." };
      const result = await this.store.create(actor.userId, newManagerState(identity));
      return { ok: true, save: result.save, message: result.created
        ? "Clube criado! Sua história começa em Campos dos Goytacazes."
        : "Seu clube já estava criado e foi recuperado." };
    } catch (error) {
      return { ok: false, message: error instanceof ManagerRuleError ? error.message : "Não foi possível criar o clube agora. Tente novamente." };
    }
  }

  async runCommand(actor: Actor, leagueId: string, command: ManagerCommand, expectedVersion: number): Promise<ManagerResult> {
    try {
      if (!await this.authorize(actor, leagueId)) return { ok: false, message: "Selecione a pelada BQ para acessar esta carreira." };
      if (!this.store) return { ok: false, message: "A carreira ainda está em preparação." };
      const save = await this.store.read(actor.userId);
      if (!save) return { ok: false, message: "Crie seu clube primeiro." };
      if (save.version !== expectedVersion) return { ok: true, save, message: "Seu clube foi atualizado em outra aba. Confira os dados e tente novamente." };
      const catalog = command.type === "open-pack" ? await this.readCatalog(actor, leagueId) : [];
      const next = executeCommand(save.state, command, { catalog, now: this.clock().toISOString(), newId: this.newId, random: this.random });
      if (JSON.stringify(next) === JSON.stringify(save.state)) return { ok: true, save, message: "Este pacote já foi processado." };
      let version: number;
      try { version = await this.store.commit(actor.userId, save.version, next, command.type, command); }
      catch (error) {
        if (error instanceof ManagerStoreError && error.code === "manager_conflict") return { ok: false, message: "Outra ação foi salva ao mesmo tempo. Atualize a página antes de continuar." };
        throw error;
      }
      return { ok: true, save: { version, state: next }, message: command.type === "fuse"
        ? "Evolução concluída. As cópias selecionadas foram consumidas."
        : command.type === "open-pack" ? "Pacote aberto. Escolha sua carta." : "Carta adicionada ao seu clube!" };
    } catch (error) {
      return { ok: false, message: error instanceof ManagerRuleError ? error.message : "Não foi possível concluir a ação. Atualize a página para conferir seu clube." };
    }
  }

  private authorize(actor: Actor, leagueId: string) {
    return withAuthenticatedTransaction(this.pool, actor, async (client) => {
      const source = await client.query<{ league_id: string | null }>("SELECT public.get_bq_manager_source_league() league_id");
      if (source.rows[0]?.league_id !== leagueId) return false;
      const allowed = await client.query("SELECT 1 FROM public.leagues WHERE id=$1::uuid AND feature_tier='complete' AND public.is_league_member($1::uuid)", [leagueId]);
      return Boolean(allowed.rowCount);
    });
  }

  private readCatalog(actor: Actor, leagueId: string): Promise<AthleteSource[]> {
    return withAuthenticatedTransaction(this.pool, actor, async (client) => {
      const result = await client.query<Record<string, unknown>>("SELECT * FROM public.get_manager_player_catalog_for_league($1::uuid)", [leagueId]);
      return result.rows.flatMap((row) => {
        const traits = Array.isArray(row.traits) ? row.traits.filter((trait): trait is AthleteSource["traits"][number] => trait === "defensive" || trait === "midfield" || trait === "offensive") : [];
        const source: AthleteSource = { playerId: String(row.player_id), name: String(row.name), avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
          snapshotId: String(row.snapshot_id), formula: String(row.formula), capturedAt: String(row.captured_at), overall: Number(row.overall),
          positions: { DEF: Number(row.def_overall), ALA_MEI: Number(row.ala_mei_overall), ATA: Number(row.ata_overall), GOL: Number(row.gol_overall) },
          traits, goalkeeperEligible: row.goalkeeper_eligible === true, trend: row.trend === "rising" || row.trend === "falling" ? row.trend : "steady",
          stats: { rounds: Number(row.rounds), goals: Number(row.goals), assists: Number(row.assists) } };
        if (!traits.length || row.overall == null || !Number.isFinite(source.overall)
          || Object.values(source.positions).some((value) => !Number.isFinite(value) || value < 40 || value > 99)) return [];
        if (Math.abs(composedOverall(source, source.positions) - source.overall) > .11) return [];
        return [source];
      }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    });
  }
}
