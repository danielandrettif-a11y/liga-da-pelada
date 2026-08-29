"use client";

import { useState } from "react";
import { Loader2 } from "@/components/icons";
import { cancelCartolaEmailReminders } from "@/app/mais/notificacoes/cancelar/actions";

export function CancelCartolaEmailForm({ userId, token }: { userId: string; token: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);
  async function cancel() { setBusy(true); setResult(await cancelCartolaEmailReminders(userId, token)); setBusy(false); }
  if (result?.success) return <div className="rounded-2xl border border-accent/30 bg-accent/10 p-5 text-center"><h2 className="font-black text-foreground">Lembretes cancelados</h2><p className="mt-2 text-sm text-muted">Você não receberá mais e-mails do Cartola. É possível reativar em Mais → Notificações.</p></div>;
  return <div className="glass-card p-5 text-center"><h2 className="text-lg font-black text-foreground">Cancelar e-mails do Cartola?</h2><p className="mt-2 text-sm leading-6 text-muted">Isso desativa somente os lembretes por e-mail. Os alertas do celular continuam como estão.</p><button type="button" onClick={() => void cancel()} disabled={busy} className="mt-5 flex w-full items-center justify-center rounded-xl bg-danger px-4 py-3 text-sm font-black text-white disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancelar lembretes"}</button>{result?.error && <p className="mt-3 text-xs text-danger">{result.error}</p>}</div>;
}
