"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "@/components/icons";
import { auditAndRepairCurrentSeasonPacks } from "@/lib/actions/fantasy-cards";

export function FantasyPackAudit() {
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  return <section className="glass-card space-y-3 p-4"><div><h2 className="text-sm font-black text-foreground">Auditoria de pacotes</h2><p className="mt-1 text-xs text-muted">Verifica a temporada ativa, repara somente recompensas ausentes e nunca duplica pacotes.</p></div><button type="button" disabled={pending} onClick={() => startTransition(async () => { const result = await auditAndRepairCurrentSeasonPacks(); if (!result.success) setError(result.error || "Não foi possível auditar."); else { setReport(result.rounds); setError(""); } })} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-xs font-black text-background disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{pending ? "Auditando..." : "Auditar e reparar"}</button>{error && <p className="text-xs font-bold text-danger">{error}</p>}{report && <div className="space-y-2">{report.map((item) => <div key={item.roundId} className="rounded-xl border border-border p-3 text-xs"><p className="font-black text-foreground">Rodada {item.roundNumber}: {item.received}/{item.eligible} receberam</p>{item.missing.length ? <p className="mt-1 text-warning">Corrigidos ({item.repaired}): {item.missing.join(", ")}</p> : <p className="mt-1 text-success">Todos os elegíveis já tinham pacote.</p>}</div>)}</div>}</section>;
}
