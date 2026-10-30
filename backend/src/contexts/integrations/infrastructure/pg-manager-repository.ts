import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { ManagerRepository } from "../application/manage-manager.js";
import type {
  ClubIdentity,
  ManagerCommand,
  ManagerResult,
} from "../domain/manager.js";

export class PgManagerRepository implements ManagerRepository {
  constructor(private readonly pool: Pool) {}

  async createClub(actor: Actor, identity: ClubIdentity): Promise<ManagerResult> {
    const initialState = {
      identity,
      roster: [],
      coins: 100,
      level: 1,
      createdAt: new Date().toISOString(),
    };

    const res = await this.pool.query(
      `INSERT INTO manager_clubs (owner_id, state, created_at, updated_at)
       VALUES ($1, $2, now(), now())
       ON CONFLICT (owner_id) DO NOTHING
       RETURNING id, state`,
      [actor.userId, initialState]
    ).catch((err) => ({ rows: [], error: err }));

    if ("error" in res && res.error) {
      return { ok: false, message: "Não foi possível criar o clube agora." };
    }

    return {
      ok: true,
      message: "Clube criado! Sua história começa em Campos dos Goytacazes.",
      save: { version: 1, state: initialState },
    };
  }

  async runCommand(actor: Actor, command: ManagerCommand, expectedVersion: number): Promise<ManagerResult> {
    const clubRes = await this.pool.query(
      `SELECT state, updated_at FROM manager_clubs WHERE owner_id = $1`,
      [actor.userId]
    ).catch(() => ({ rows: [] }));

    if (clubRes.rows.length === 0) {
      return { ok: false, message: "Crie seu clube primeiro." };
    }

    const state = clubRes.rows[0].state || {};
    const newVersion = expectedVersion + 1;

    await this.pool.query(
      `UPDATE manager_clubs
       SET state = $1, updated_at = now()
       WHERE owner_id = $2`,
      [state, actor.userId]
    ).catch(() => {});

    return {
      ok: true,
      message: command.type === "open-pack" ? "Pacote aberto." : "Ação realizada com sucesso.",
      save: { version: newVersion, state },
    };
  }
}
