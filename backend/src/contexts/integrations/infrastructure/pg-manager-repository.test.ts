import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { Actor } from "../../../shared/actor.js";
import { newManagerState, type AthleteSource, type ManagerState } from "../domain/manager.js";
import { PgManagerRepository, type ManagerStore } from "./pg-manager-repository.js";

const actor: Actor = { userId: "user-1", email: "user1@test.com", name: "User 1" };
const identity = { name: "Goytacaz", abbreviation: "GOY", color: "#0000ff", crest: "shield" as const, kit: "stripes" as const };

function authorizedPool(sourceLeague = "league-1") {
  const query = vi.fn(async (sql: string) => {
    if (["BEGIN", "COMMIT", "ROLLBACK", "SET LOCAL ROLE authenticated"].includes(sql) || sql.includes("set_config(")) return { rows: [], rowCount: 0 };
    if (sql.includes("get_bq_manager_source_league")) return { rows: [{ league_id: sourceLeague }], rowCount: 1 };
    if (sql.includes("FROM public.leagues")) return { rows: [{ allowed: 1 }], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  return { connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }) } as unknown as Pool;
}

function store(save: { version: number; state: ManagerState } | null = null): ManagerStore {
  return {
    read: vi.fn().mockResolvedValue(save),
    create: vi.fn(async (_ownerId, state) => ({ created: true, save: { version: 0, state } })),
    commit: vi.fn().mockResolvedValue(2),
  };
}

describe("PgManagerRepository", () => {
  it("authorizes against the main app but creates state in the isolated store", async () => {
    const managerStore = store();
    const result = await new PgManagerRepository(authorizedPool(), managerStore).createClub(actor, "league-1", identity);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.save).toEqual({ version: 0, state: newManagerState(identity) });
    expect(managerStore.create).toHaveBeenCalledWith(actor.userId, newManagerState(identity));
  });

  it("rejects a league that is not the configured BQ source", async () => {
    const managerStore = store();
    const result = await new PgManagerRepository(authorizedPool("other"), managerStore).createClub(actor, "league-1", identity);
    expect(result).toEqual({ ok: false, message: "Selecione a pelada BQ para acessar esta carreira." });
    expect(managerStore.create).not.toHaveBeenCalled();
  });

  it("executes and commits a claim with the persisted expected version", async () => {
    const source: AthleteSource = { playerId: "p1", name: "Atleta", avatarUrl: null, snapshotId: "s1", formula: "legacy",
      capturedAt: "2026-01-01T00:00:00.000Z", overall: 70, positions: { DEF: 70, ALA_MEI: 70, ATA: 70, GOL: 40 },
      traits: ["defensive"], goalkeeperEligible: false, trend: "steady", stats: { rounds: 1, goals: 0, assists: 0 } };
    const state = newManagerState(identity);
    state.packs.push({ id: "pack-1", kind: "choice", label: "Escolha", bound: true, status: "offered", offers: [source] });
    const managerStore = store({ version: 1, state });
    const repo = new PgManagerRepository(authorizedPool(), managerStore, () => new Date("2026-02-01T00:00:00.000Z"), () => "card-1", () => 0);
    const result = await repo.runCommand(actor, "league-1", { type: "claim-pack", packId: "pack-1", playerId: "p1" }, 1);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.save.version).toBe(2); expect(result.save.state.cards[0]?.id).toBe("card-1"); }
    expect(managerStore.commit).toHaveBeenCalledWith(actor.userId, 1, expect.any(Object), "claim-pack", expect.any(Object));
  });

  it("returns the fresh save on an optimistic version mismatch without committing", async () => {
    const current = { version: 4, state: newManagerState(identity) };
    const managerStore = store(current);
    const result = await new PgManagerRepository(authorizedPool(), managerStore).runCommand(actor, "league-1", { type: "open-pack", packId: "p1" }, 3);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.save).toBe(current);
    expect(managerStore.commit).not.toHaveBeenCalled();
  });
});
