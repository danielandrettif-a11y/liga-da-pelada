import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./auth", () => ({ getCurrentAccount: vi.fn() }));

import { getCurrentAccount } from "./auth";
import { getMyLeagues } from "./league-context";

describe("getMyLeagues", () => {
  beforeEach(() => vi.resetAllMocks());

  it("loads memberships while cleanup runs and reloads after a deletion", async () => {
    let finishCleanup!: (result: { data: number }) => void;
    const cleanup = new Promise<{ data: number }>((resolve) => { finishCleanup = resolve; });
    const read = vi.fn()
      .mockResolvedValueOnce({ data: [{ leagues: { id: "expired", is_active: true } }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const client = {
      rpc: vi.fn().mockReturnValue(cleanup),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: read }),
        }),
      }),
    };
    vi.mocked(getCurrentAccount).mockResolvedValue({ client, user: { id: "user" } } as never);

    const result = getMyLeagues();
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    finishCleanup({ data: 1 });
    await expect(result).resolves.toEqual([]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps memberships available if cleanup fails", async () => {
    const read = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = {
      rpc: vi.fn().mockRejectedValue(new Error("unavailable")),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: read }),
        }),
      }),
    };
    vi.mocked(getCurrentAccount).mockResolvedValue({ client, user: { id: "user" } } as never);

    await expect(getMyLeagues()).resolves.toEqual([]);
    expect(read).toHaveBeenCalledOnce();
  });
});
