import { describe, expect, it, vi } from "vitest";
import { changeCallupFormat } from "./change-callup-format";

const format = { callupId: "callup-1", playersPerTeam: 7, teamsPerRound: 3 };

describe("alteração do formato da convocação", () => {
  it("não muda uma convocação que não está aberta na pelada selecionada", async () => {
    const findOpenCallup = vi.fn().mockResolvedValue(false);
    const setFormat = vi.fn();
    expect(await changeCallupFormat(format, "league-1", { findOpenCallup, setFormat }))
      .toEqual({ success: false, error: "Convocação aberta não encontrada nesta pelada." });
    expect(findOpenCallup).toHaveBeenCalledWith("callup-1", "league-1");
    expect(setFormat).not.toHaveBeenCalled();
  });

  it("retorna o tamanho do Cartola informado pelo banco", async () => {
    const findOpenCallup = vi.fn().mockResolvedValue(true);
    const setFormat = vi.fn().mockResolvedValue({ fantasySizePreserved: true, fantasyLineupSize: 6 });
    expect(await changeCallupFormat(format, "league-1", { findOpenCallup, setFormat }))
      .toEqual({ success: true, fantasySizePreserved: true, fantasyLineupSize: 6 });
    expect(setFormat).toHaveBeenCalledWith(format);
  });
});
