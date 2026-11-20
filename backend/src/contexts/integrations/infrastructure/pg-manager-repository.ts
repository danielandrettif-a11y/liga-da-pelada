import type { Pool } from "pg";
import type { Actor } from "../../../shared/actor.js";
import type { ManagerRepository } from "../application/manage-manager.js";
import type { ClubIdentity, ManagerCommand, ManagerResult } from "../domain/manager.js";

// The manager owns a separate database and its commands require the canonical
// engine and versioned commit. Never acknowledge a write until those exist here.
export class PgManagerRepository implements ManagerRepository {
  constructor(_pool: Pool) {}

  async createClub(_actor: Actor, _identity: ClubIdentity): Promise<ManagerResult> {
    return { ok: false, message: "A API do BQ Manager ainda não está disponível." };
  }

  async runCommand(_actor: Actor, _command: ManagerCommand, _expectedVersion: number): Promise<ManagerResult> {
    return { ok: false, message: "A API do BQ Manager ainda não está disponível." };
  }
}
