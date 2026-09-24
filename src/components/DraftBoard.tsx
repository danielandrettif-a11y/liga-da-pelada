"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Crown, Loader2, Microphone, RotateCcw, Sparkles, Users } from "@/components/icons";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerProfileBadge } from "./PlayerProfileBadge";
import { supabase } from "@/lib/supabase";
import { applyDraftSwap, finalizeTeamDraft, makeTeamDraftPick, replaceTeamDraftCaptain, restartTeamDraft, startTeamDraft, type DraftWorkspace } from "@/lib/actions/draft";
import { draftSelectionOrder } from "@/lib/draft-balance";

export function DraftBoard({ workspace }: { workspace: DraftWorkspace }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const expectedOrder = draftSelectionOrder(workspace.currentPick);
  const currentCaptain = workspace.captains.find((captain) => captain.selectionOrder === expectedOrder) || null;
  const canPick = workspace.status === "active" && (workspace.isAdmin || currentCaptain?.player.id === workspace.currentPlayerId);
  const available = useMemo(() => workspace.players.filter((player) => player.active && player.teamSlot === null), [workspace.players]);

  useEffect(() => {
    const refresh = () => startTransition(() => router.refresh());
    const channel = supabase.channel(`draft-${workspace.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_drafts", filter: `id=eq.${workspace.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_draft_picks", filter: `draft_id=eq.${workspace.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_draft_captains", filter: `draft_id=eq.${workspace.id}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router, workspace.id]);

  function run(action: () => Promise<{ success: boolean; error?: string; roundId?: string }>, onSuccess?: (result: any) => void) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (!result.success) setError(result.error || "Não foi possível atualizar o Draft.");
      else {
        setSelected(null);
        onSuccess?.(result);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 pb-6">
      <section className="overflow-hidden rounded-3xl border border-accent/35 bg-[radial-gradient(circle_at_top_right,rgba(204,255,0,.18),transparent_42%),linear-gradient(145deg,#092318,#04120b)] p-5 shadow-[0_18px_55px_rgba(0,0,0,.35)]">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-accent">Formação oficial</p><h1 className="mt-1 font-athletic text-3xl font-black uppercase italic text-foreground">Draft BQ</h1><p className="mt-2 max-w-md text-xs leading-5 text-muted">Os três capitães montam seus times em ordem cobra. Cada escolha aparece para todos em tempo real.</p></div>
          <Link href={`/convocacao?callup=${workspace.callupId}&section=collective`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent" aria-label="Abrir Coletiva de imprensa"><Microphone className="h-6 w-6" /></Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase">
          <span className="rounded-full bg-white/8 px-3 py-1.5 text-foreground">{workspace.players.length - available.length}/{workspace.players.length} escalados</span>
          <span className={`rounded-full px-3 py-1.5 ${workspace.balanceScore >= 80 ? "bg-accent/15 text-accent" : "bg-warning/15 text-warning"}`}>Equilíbrio {workspace.balanceScore}/100</span>
          {pending && <span className="flex items-center gap-1 text-muted"><Loader2 className="h-3 w-3 animate-spin" /> atualizando</span>}
        </div>
      </section>

      {error && <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 text-xs font-bold text-danger">{error}</div>}
      {workspace.pauseReason && <div className="flex gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-warning"><AlertTriangle className="h-5 w-5 shrink-0" /><p className="text-xs font-bold">{workspace.pauseReason}</p></div>}

      <section className="grid gap-3 sm:grid-cols-3">
        {workspace.captains.map((captain) => {
          const roster = workspace.players.filter((player) => player.teamSlot === captain.teamSlot).sort((a, b) => (a.pickNumber || 0) - (b.pickNumber || 0));
          const summary = workspace.summaries.find((item) => item.teamSlot === captain.teamSlot);
          const active = currentCaptain?.teamSlot === captain.teamSlot && workspace.status === "active";
          return (
            <article key={captain.teamSlot} className={`rounded-3xl border p-4 ${active ? "border-accent bg-accent/10 shadow-[0_0_30px_rgba(204,255,0,.1)]" : "border-border bg-surface"}`}>
              <div className="flex items-center gap-3">
                <PlayerAvatar playerId={captain.player.id} name={captain.player.name} avatarUrl={captain.player.avatarUrl} className="h-12 w-12 rounded-full" />
                <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase text-accent">Capitão {captain.selectionOrder ? `#${captain.selectionOrder}` : captain.teamSlot}</p><h2 className="truncate text-sm font-black text-foreground">{captain.player.name}</h2><p className="text-[10px] text-muted">Aproveitamento {captain.winRate.toFixed(0)}% · {captain.officialRounds} rodadas</p></div>
                <Crown className="h-5 w-5 text-warning" />
              </div>
              {workspace.isAdmin && ["setup", "paused"].includes(workspace.status) && (
                <select value={captain.player.id} onChange={(event) => run(() => replaceTeamDraftCaptain(workspace.id, captain.teamSlot, event.target.value))} className="mt-3 w-full rounded-xl border border-border bg-background px-2 py-2 text-[10px] font-bold text-foreground">
                  {workspace.players.filter((player) => player.active && (!player.isCaptain || player.id === captain.player.id)).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                </select>
              )}
              <div className="mt-3 space-y-1.5">
                {roster.map((player) => <div key={player.id} className="flex items-center gap-2 rounded-xl bg-black/20 px-2 py-2"><PlayerAvatar playerId={player.id} name={player.name} avatarUrl={player.avatarUrl} className="h-7 w-7 rounded-full" /><span className="min-w-0 flex-1 truncate text-[11px] font-bold text-foreground">{player.name}</span>{player.isCaptain ? <Crown className="h-3.5 w-3.5 text-warning" /> : <span className="text-[9px] font-black text-muted">#{player.pickNumber}</span>}</div>)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-black/20 p-2"><p className="text-[8px] font-black uppercase text-muted">OVR médio</p><strong className="text-base text-accent">{summary?.overallAverage.toFixed(1) || "70.0"}</strong></div><div className="rounded-xl bg-black/20 p-2"><p className="text-[8px] font-black uppercase text-muted">Estrelas</p><strong className="text-base text-warning">{summary?.starsAverage.toFixed(2) || "2.00"}</strong></div></div>
            </article>
          );
        })}
      </section>

      {workspace.status === "setup" && workspace.isAdmin && <button disabled={pending} onClick={() => run(() => startTeamDraft(workspace.id))} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-4 text-sm font-black uppercase text-background"><Sparkles className="h-5 w-5" /> Começar escolhas</button>}

      {workspace.status === "active" && (
        <section className="rounded-3xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase text-accent">Escolha #{workspace.currentPick}</p><h2 className="text-lg font-black text-foreground">Vez de {currentCaptain?.player.name || "capitão"}</h2></div><Users className="h-6 w-6 text-accent" /></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {available.map((player) => <button key={player.id} type="button" disabled={!canPick || pending} onClick={() => setSelected(player.id)} className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${selected === player.id ? "border-accent bg-accent/10" : "border-border bg-background"} disabled:opacity-55`}><PlayerAvatar playerId={player.id} name={player.name} avatarUrl={player.avatarUrl} className="h-11 w-11 rounded-full" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-foreground">{player.name}</p><div className="mt-1 flex items-center gap-2"><PlayerProfileBadge profile={player.profile} /><span className="text-[9px] font-bold text-muted">OVR {player.overall?.toFixed(1) || "70.0"}</span><span className="flex items-center gap-0.5 text-[9px] font-bold text-warning">★ {player.stars || 2}</span></div></div></button>)}
          </div>
          {canPick && <button disabled={!selected || pending} onClick={() => selected && run(() => makeTeamDraftPick(workspace.id, selected))} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3.5 text-xs font-black uppercase text-background disabled:opacity-45"><CheckCircle2 className="h-4 w-4" /> Confirmar escolha</button>}
          {!canPick && <p className="mt-4 rounded-xl bg-black/20 p-3 text-center text-xs font-semibold text-muted">Acompanhe as escolhas. Somente o capitão da vez ou um administrador pode selecionar.</p>}
        </section>
      )}

      {["completed", "confirmed"].includes(workspace.status) && (
        <section className="rounded-3xl border border-accent/30 bg-accent/5 p-5">
          <div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase text-accent">Análise final</p><h2 className="text-xl font-black text-foreground">Equilíbrio {workspace.balanceScore}/100</h2></div><Sparkles className="h-7 w-7 text-accent" /></div>
          {workspace.balanceScore < 80 && workspace.suggestion ? <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 p-4"><p className="text-xs font-black text-warning">Sugestão de equilíbrio</p><p className="mt-1 text-sm text-foreground">Trocar <strong>{workspace.suggestion.playerAName}</strong> por <strong>{workspace.suggestion.playerBName}</strong> elevaria a nota para {workspace.suggestion.projectedScore}.</p>{workspace.isAdmin && workspace.status === "completed" && <button onClick={() => run(() => applyDraftSwap(workspace.id, workspace.suggestion!.playerAId, workspace.suggestion!.playerBId))} className="mt-3 rounded-xl bg-warning px-3 py-2 text-[10px] font-black uppercase text-background">Aplicar troca sugerida</button>}</div> : workspace.balanceScore < 80 ? <p className="mt-3 rounded-2xl bg-warning/10 p-4 text-sm font-bold text-warning">Os times ficaram abaixo da faixa recomendada, mas nenhuma troca simples melhora a composição. Reinicie o Draft se quiser outra formação.</p> : <p className="mt-3 rounded-2xl bg-accent/10 p-4 text-sm font-bold text-accent">Os times ficaram dentro da faixa recomendada.</p>}
          {workspace.isAdmin && workspace.status === "completed" && <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => run(() => restartTeamDraft(workspace.id))} className="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-3 text-xs font-black text-muted"><RotateCcw className="h-4 w-4" /> Reiniciar</button><button onClick={() => run(() => finalizeTeamDraft(workspace.id), (result) => router.push(`/rodadas/${result.roundId}`))} className="rounded-xl bg-accent px-3 py-3 text-xs font-black text-background">Confirmar times</button></div>}
        </section>
      )}
    </div>
  );
}
