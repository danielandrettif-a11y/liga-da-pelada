import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoState } from "@/lib/bq-manager/demo";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), client: vi.fn(), read: vi.fn(), catalog: vi.fn(), rpc: vi.fn(), insert: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("@/lib/bq-manager/server", () => ({ createManagerClient: mocks.client, readCatalog: mocks.catalog, readManagerSave: mocks.read }));
import { createManagerClub, runManagerCommand } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({ user: { id: "authenticated-owner" }, client: "authenticated-app-client" });
  mocks.client.mockReturnValue({ rpc: mocks.rpc, from: () => ({ insert: mocks.insert }) });
  mocks.read.mockResolvedValue({ version: 7, state: createDemoState() });
  mocks.rpc.mockResolvedValue({ data: 8, error: null });
  mocks.insert.mockResolvedValue({ error: null });
});

describe("BQ Manager server authority", () => {
  it("rejects anonymous mutations before accessing the game database", async () => {
    mocks.account.mockResolvedValue({ user: null });
    expect((await runManagerCommand({ type: "open-pack", packId: "demo-choice" }, 7)).ok).toBe(false);
    expect((await createManagerClub(createDemoState().club)).ok).toBe(false);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("derives the owner from authentication and computes fusion from stored state", async () => {
    const result = await runManagerCommand({ type: "fuse", targetId: "demo-main", donorIds: ["demo-superior"], mode: "inherit", position: "ALA_MEI" }, 7);
    expect(result.ok).toBe(true);
    expect(mocks.read).toHaveBeenCalledWith(expect.anything(), "authenticated-owner");
    expect(mocks.rpc).toHaveBeenCalledWith("manager_commit", expect.objectContaining({ p_owner: "authenticated-owner", p_version: 7 }));
    expect(mocks.rpc.mock.calls[0][1].p_state.cards[0].inherited.ALA_MEI).toBe(3);
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
  it("returns fresh state for a stale tab without spending anything", async () => {
    const result = await runManagerCommand({ type: "open-pack", packId: "demo-choice" }, 6);
    expect(result.ok && result.save.version).toBe(7);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
  it("reports a database version conflict without claiming success", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
    const result = await runManagerCommand({ type: "fuse", targetId: "demo-main", donorIds: ["demo-superior"], mode: "inherit", position: "ALA_MEI" }, 7);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Outra ação");
  });
  it("uses a unique owner record and never overwrites an existing club on repeated creation", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "23505" } });
    const result = await createManagerClub(createDemoState().club);
    expect(result.ok && result.save.version).toBe(7);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ owner_id: "authenticated-owner" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
