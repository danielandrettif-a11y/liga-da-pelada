import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

import { getPrivateBalanceTagsForDraw } from "./private-balance-tags";

describe("getPrivateBalanceTagsForDraw", () => {
  it("não bloqueia o sorteio quando as tags privadas estão indisponíveis", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = {
      from: () => ({
        select: () => ({
          in: async () => ({ data: null, error: { message: "permission denied" } }),
        }),
      }),
    };

    await expect(getPrivateBalanceTagsForDraw(["p1"], client)).resolves.toEqual(new Map());
  });
});
