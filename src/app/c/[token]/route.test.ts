import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/league-context", () => ({
  ACTIVE_LEAGUE_COOKIE: "active_league_id",
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => null,
}));

import { GET } from "./route";

describe("compact callup invite route", () => {
  it("reescreve internamente para a convocação sem redirecionar o navegador", async () => {
    const request = new NextRequest("https://pelada.example/c/invite-456");
    const response = await GET(request, {
      params: Promise.resolve({ token: "invite-456" }),
    });

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://pelada.example/convocacao?invite=invite-456",
    );
  });
});
