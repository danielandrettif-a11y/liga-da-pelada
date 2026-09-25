"use server";

import { randomInt, randomUUID } from "node:crypto";
import { getCurrentAccount } from "@/lib/auth";
import { executeCommand, ManagerRuleError, newManagerState } from "@/lib/bq-manager/engine";
import { createManagerClient, readCatalog, readManagerSave } from "@/lib/bq-manager/server";
import type { ClubIdentity, ManagerCommand, ManagerResult } from "@/lib/bq-manager/types";

export async function createManagerClub(identity: ClubIdentity): Promise<ManagerResult> {
  try {
    const account = await getCurrentAccount();
    if (!account.user) return { ok: false, message: "Entre na sua conta para criar um clube." };
    const client = createManagerClient();
    if (!client) return { ok: false, message: "A carreira ainda está em preparação. Experimente a demonstração." };
    const state = newManagerState(identity);
    const { error } = await client.from("manager_clubs").insert({ owner_id: account.user.id, state });
    if (error && error.code !== "23505") throw new Error("manager_create_failed");
    const save = await readManagerSave(client, account.user.id);
    if (!save) throw new Error("manager_create_failed");
    return { ok: true, save, message: error ? "Seu clube já estava criado e foi recuperado." : "Clube criado! Sua história começa em Campos dos Goytacazes." };
  } catch (error) {
    return { ok: false, message: error instanceof ManagerRuleError ? error.message : "Não foi possível criar o clube agora. Tente novamente." };
  }
}

export async function runManagerCommand(command: ManagerCommand, expectedVersion: number): Promise<ManagerResult> {
  try {
    const account = await getCurrentAccount();
    if (!account.user) return { ok: false, message: "Sua sessão expirou. Entre novamente." };
    const client = createManagerClient();
    if (!client) return { ok: false, message: "A carreira ainda está em preparação." };
    const save = await readManagerSave(client, account.user.id);
    if (!save) return { ok: false, message: "Crie seu clube primeiro." };
    if (!Number.isSafeInteger(expectedVersion) || save.version !== expectedVersion) {
      return { ok: true, save, message: "Seu clube foi atualizado em outra aba. Confira os dados e tente novamente." };
    }
    const catalog = command?.type === "open-pack" ? await readCatalog(account.client) : [];
    const next = executeCommand(save.state, command, {
      catalog, now: new Date().toISOString(), newId: randomUUID, random: () => randomInt(0, 2 ** 48 - 1) / (2 ** 48 - 1),
    });
    // Idempotent open/claim: do not produce duplicate audit entries or versions.
    if (JSON.stringify(next) === JSON.stringify(save.state)) return { ok: true, save, message: "Este pacote já foi processado." };
    const { data: version, error } = await client.rpc("manager_commit", {
      p_owner: account.user.id, p_version: save.version, p_state: next, p_kind: command.type, p_details: command,
    });
    if (error) {
      if (error.code === "40001") return { ok: false, message: "Outra ação foi salva ao mesmo tempo. Atualize a página antes de continuar." };
      throw new Error("manager_commit_failed");
    }
    return { ok: true, save: { version, state: next }, message: command.type === "fuse" ? "Evolução concluída. As cópias selecionadas foram consumidas." : command.type === "open-pack" ? "Pacote aberto. Escolha sua carta." : "Carta adicionada ao seu clube!" };
  } catch (error) {
    return { ok: false, message: error instanceof ManagerRuleError ? error.message : "Não foi possível concluir a ação. Atualize a página para conferir seu clube." };
  }
}
