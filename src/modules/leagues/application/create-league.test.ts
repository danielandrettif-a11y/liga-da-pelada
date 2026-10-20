import { describe, expect, it, vi } from "vitest";
import { createLeagueForUser, DuplicateLeagueNameError } from "./create-league";

describe("criação de pelada", () => {
  const input = { name: "  Pelada   HG ", tier: "basic", visibility: "private" };

  it("não consulta o banco para uma entrada inválida", async () => {
    const create = vi.fn();
    expect(await createLeagueForUser({ ...input, name: "HG" }, { create })).toEqual({ status: "invalid" });
    expect(create).not.toHaveBeenCalled();
  });

  it("envia dados normalizados ao repositório", async () => {
    const create = vi.fn().mockResolvedValue("new-league");
    expect(await createLeagueForUser(input, { create })).toEqual({ status: "created", leagueId: "new-league" });
    expect(create).toHaveBeenCalledWith({ name: "Pelada HG", tier: "basic", visibility: "private" });
  });

  it("mantém o erro público existente se o banco falhar", async () => {
    const create = vi.fn().mockRejectedValue(new Error("database error"));
    expect(await createLeagueForUser(input, { create })).toEqual({ status: "failed" });
  });

  it("distingue nome repetido de uma falha genérica", async () => {
    const create = vi.fn().mockRejectedValue(new DuplicateLeagueNameError());
    expect(await createLeagueForUser(input, { create })).toEqual({ status: "duplicate" });
  });
});
