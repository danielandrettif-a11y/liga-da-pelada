import { describe, expect, it } from "vitest";
import { isEntryFlowScreen, safeEntryDestination } from "./entry-flow";

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

describe("isEntryFlowScreen", () => {
  it("mantém a homepage e o seletor de peladas acessíveis durante a apresentação", () => {
    expect(isEntryFlowScreen("/inicio")).toBe(true);
    expect(isEntryFlowScreen("/lobby")).toBe(true);
    expect(isEntryFlowScreen("/lobby/criar")).toBe(true);
    expect(isEntryFlowScreen("/peladas")).toBe(true);
  });

  it("não libera o restante do aplicativo antes da escolha da pelada", () => {
    expect(isEntryFlowScreen("/")).toBe(false);
    expect(isEntryFlowScreen("/cartola")).toBe(false);
    expect(isEntryFlowScreen("/meu-perfil")).toBe(false);
  });
});
