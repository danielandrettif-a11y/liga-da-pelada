import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), rosterApi: vi.fn(), getTag: vi.fn(), setTag: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getCurrentAccount: mocks.account }));
vi.mock("@/modules/roster/infrastructure/roster-api-session", () => ({ rosterApiFor: mocks.rosterApi }));

import { getPlayerPrivateBalanceTag, setPlayerPrivateBalanceTag } from "./private-balance-tags";

const playerId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.account.mockResolvedValue({ user: { id: "user-1" }, client: {} });
  mocks.rosterApi.mockResolvedValue({
    getPlayerPrivateBalanceTag: mocks.getTag,
    setPlayerPrivateBalanceTag: mocks.setTag,
  });
});

describe("private balance tag actions", () => {
  it("uses the roster API for authorized reads and writes", async () => {
    mocks.getTag.mockResolvedValue({ allowed: true, tag: "bagre_1" });
    await expect(getPlayerPrivateBalanceTag(playerId)).resolves.toEqual({ allowed: true, tag: "bagre_1" });
    await expect(setPlayerPrivateBalanceTag(playerId, "craque_2")).resolves.toEqual({ success: true });
    expect(mocks.setTag).toHaveBeenCalledWith(playerId, "craque_2");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/jogadores/${playerId}/editar`);
  });

  it("rejects invalid values before transport and preserves controlled failures", async () => {
    await expect(setPlayerPrivateBalanceTag(playerId, "elite" as never)).resolves.toMatchObject({ success: false });
    expect(mocks.setTag).not.toHaveBeenCalled();
    mocks.setTag.mockRejectedValue(new Error("Editor não autorizado"));
    await expect(setPlayerPrivateBalanceTag(playerId, null)).resolves.toEqual({ success: false, error: "Editor não autorizado" });
  });

  it("does not expose private data when the account or API is unavailable", async () => {
    mocks.account.mockResolvedValueOnce({ user: null, client: {} });
    await expect(getPlayerPrivateBalanceTag(playerId)).resolves.toEqual({ allowed: false, tag: null });
    mocks.getTag.mockRejectedValueOnce(new Error("unavailable"));
    await expect(getPlayerPrivateBalanceTag(playerId)).resolves.toEqual({ allowed: false, tag: null });
  });
});
