"use client";

import { useMemo, useState } from "react";
import { importGuestRoster } from "@/app/admin/importar-lista/actions";

function normalized(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function GuestRosterImport({ existingNames }: { existingNames: string[] }) {
  const [text, setText] = useState("");
  const existing = useMemo(() => new Set(existingNames.map(normalized)), [existingNames]);
  const preview = useMemo(() => {
    const seen = new Set<string>();
    return text.split(/\r?\n/).map((raw) => raw.trim().replace(/\s+/g, " ")).filter(Boolean).map((name) => {
      const key = normalized(name);
      const duplicate = existing.has(key) || seen.has(key);
      seen.add(key);
      return { name, duplicate, valid: name.length >= 2 && name.length <= 120 };
    });
  }, [text, existing]);
  const ready = preview.filter((row) => row.valid && !row.duplicate);

  return <div className="space-y-4">
    <label className="block text-sm font-bold text-white" htmlFor="guest-list">Cole um nome por linha</label>
    <textarea id="guest-list" value={text} onChange={(event) => setText(event.target.value)} rows={9}
      placeholder={"João Silva\nMaria Souza\nCarlos Santos"}
      className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-white" />
    {preview.length > 0 && <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-bold text-white">Prévia: {ready.length} novos · {preview.length - ready.length} para revisar</h2>
      <p className="mt-1 text-xs text-muted">Nomes repetidos são ignorados. Edite o texto para corrigir ou diferenciar pessoas com o mesmo nome.</p>
      <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">{preview.map((row, index) => <li key={`${index}-${row.name}`} className={row.duplicate || !row.valid ? "text-amber-300" : "text-white"}>
        {row.name} {row.duplicate ? "· já existe/repetido" : !row.valid ? "· nome inválido" : "· novo"}
      </li>)}</ul>
    </div>}
    <form action={importGuestRoster}>
      <input type="hidden" name="names" value={ready.map((row) => row.name).join("\n")} />
      <button type="submit" disabled={ready.length === 0 || ready.length > 100} className="w-full rounded-xl bg-accent px-4 py-3 font-black text-black disabled:opacity-40">Criar {ready.length} convidados</button>
    </form>
  </div>;
}
