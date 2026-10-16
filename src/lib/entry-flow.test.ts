import { describe, expect, it } from "vitest";
import { safeEntryDestination } from "./entry-flow";

describe("safeEntryDestination", () => {
  it("preserva um convite e seus parâmetros", () => {
    expect(safeEntryDestination("/convite/abc?origem=whatsapp")).toBe("/convite/abc?origem=whatsapp");
  });

  it("não permite URL externa ou um retorno em loop", () => {
    expect(safeEntryDestination("//site-malicioso.test")).toBe("/");
    expect(safeEntryDestination("/login?next=/cartola")).toBe("/");
    expect(safeEntryDestination("/auth/callback")).toBe("/");
  });
});
