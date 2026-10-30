import type { Actor } from "../../../shared/actor.js";
import {
  type ClubIdentity,
  type ManagerCommand,
  type ManagerResult,
  validateClubIdentity,
} from "../domain/manager.js";

export interface ManagerRepository {
  createClub(actor: Actor, identity: ClubIdentity): Promise<ManagerResult>;
  runCommand(actor: Actor, command: ManagerCommand, expectedVersion: number): Promise<ManagerResult>;
}

export class ManageManagerUseCase {
  constructor(private readonly repository: ManagerRepository) {}

  async createClub(actor: Actor, identity: ClubIdentity): Promise<ManagerResult> {
    const val = validateClubIdentity(identity);
    if (!val.valid) {
      return { ok: false, message: val.error || "Dados do clube inválidos." };
    }
    return this.repository.createClub(actor, identity);
  }

  async runCommand(actor: Actor, command: ManagerCommand, expectedVersion: number): Promise<ManagerResult> {
    if (!command || !command.type) {
      return { ok: false, message: "Comando inválido." };
    }
    if (!Number.isSafeInteger(expectedVersion)) {
      return { ok: false, message: "Versão inválida." };
    }
    return this.repository.runCommand(actor, command, expectedVersion);
  }
}
