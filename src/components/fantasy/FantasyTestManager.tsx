"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Play, RotateCcw, Trophy, X } from "@/components/icons";
import {
  createFantasyTestSession,
  processFantasyTestSession,
  resetFantasyTestSession,
} from "@/lib/actions/fantasy";
import { useDialogViewport } from "@/lib/useDialogViewport";

type FriendlyRound = {
  id: string;
  number: number;
  date: string;
  start_time: string | null;
  status: "draft" | "active" | "finished";
  round_players?: { count: number }[];
  matches?: { id: string; status: string; started_at: string | null }[];
};

export function FantasyTestManager({ testSession, friendlyRounds }: { testSession: any; friendlyRounds: FriendlyRound[] }) {
  const router = useRouter();
  const selectable = useMemo(() => friendlyRounds.filter((round) => {
    const started = (round.matches || []).some((match) => Boolean(match.started_at));
    return round.status !== "active" || !started;
  }), [friendlyRounds]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [roundId, setRoundId] = useState(selectable.find((round) => round.date === today)?.id || selectable[0]?.id || "");
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  useDialogViewport(confirmReset);

  function run(action: () => Promise<{ success: boolean; error?: string }>, successMessage: string, closeReset = false) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setMessage({ type: "error", text: result.error || "Não foi possível concluir a ação." });
        return;
      }
      if (closeReset) setConfirmReset(false);
      setMessage({ type: "success", text: successMessage });
      router.refresh();
    });
  }

  const activeRound = testSession?.round as FriendlyRound | undefined;
  const playerCount = activeRound?.round_players?.[0]?.count || 0;

  return (
    <section className="overflow-hidden rounded-3xl border border-warning/35 bg-gradient-to-br from-warning/12 via-surface to-background">
      <div className="border-b border-warning/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-warning/15 text-warning">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-black uppercase text-foreground">Rodada teste do Cartola</h2>
              <span className="rounded-full bg-warning px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-background">Sandbox</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted">Use um amistoso para testar escalação, palpites e pontuação. O resultado não altera ranking, preços, patrimônio ou histórico oficial.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-2xl border border-success/25 bg-success/8 p-4">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-success">Como testar sem sujar a temporada</p>
          <ol className="mt-2 space-y-1.5 text-xs leading-5 text-muted">
            <li><strong className="text-foreground">1.</strong> Crie uma pré-lista do tipo <strong className="text-foreground">Amistoso</strong>.</li>
            <li><strong className="text-foreground">2.</strong> Selecione o amistoso aqui e crie o ambiente Sandbox.</li>
            <li><strong className="text-foreground">3.</strong> Teste escalações e pontuação; depois use <strong className="text-foreground">Resetar teste</strong>.</li>
          </ol>
          <p className="mt-2 text-[11px] font-bold leading-4 text-warning">Não use uma Ranked real para simulação: ela altera preços, patrimônio e histórico oficial.</p>
        </div>
        {testSession && activeRound ? (
          <>
            <div className="rounded-2xl border border-warning/25 bg-warning/8 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[.18em] text-warning">Teste ativo</p>
                  <p className="mt-1 text-base font-black text-foreground">Amistoso {String(activeRound.number).padStart(2, "0")}</p>
                  <p className="mt-1 text-xs text-muted">{formatDate(activeRound.date)} · {activeRound.start_time?.slice(0, 5) || "sem horário"} · {playerCount} jogadores</p>
                </div>
                <span className="rounded-full border border-warning/25 px-2.5 py-1 text-[9px] font-black uppercase text-warning">{statusLabel(testSession.status)}</span>
              </div>
            </div>

            <Link href="/cartola" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-warning text-sm font-black text-background active:scale-[0.98]">
              <Play className="h-4 w-4" /> Abrir Cartola em modo teste
            </Link>

            {activeRound.status === "finished" && testSession.status !== "finished" && (
              <button type="button" disabled={pending} onClick={() => run(() => processFantasyTestSession(activeRound.id), "Pontuação de teste calculada.")} className="h-12 w-full rounded-xl border border-warning/35 bg-warning/10 text-sm font-black text-warning disabled:opacity-50">
                {pending ? "Calculando..." : "Calcular resultado do teste"}
              </button>
            )}

            <button type="button" disabled={pending} onClick={() => setConfirmReset(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-danger/35 bg-danger/10 text-sm font-black text-danger disabled:opacity-50">
              <RotateCcw className="h-4 w-4" /> Resetar e apagar somente o teste
            </button>
          </>
        ) : (
          <>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-muted">Amistoso usado no teste</span>
              <select value={roundId} onChange={(event) => setRoundId(event.target.value)} className="h-12 w-full rounded-xl border border-border bg-background px-3 text-base font-bold text-foreground sm:text-sm">
                {selectable.map((round) => <option key={round.id} value={round.id}>Amistoso {String(round.number).padStart(2, "0")} · {formatDate(round.date)} · {round.status === "finished" ? "finalizado" : "a jogar"}</option>)}
              </select>
            </label>
            {selectable.length ? (
              <button type="button" disabled={pending || !roundId} onClick={() => run(() => createFantasyTestSession(roundId), "Modo teste criado. O mercado já está disponível.")} className="h-12 w-full rounded-xl bg-warning text-sm font-black text-background disabled:opacity-50">
                {pending ? "Criando ambiente..." : "Criar ambiente de teste"}
              </button>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">Não há amistoso disponível nesta temporada. Crie uma pré-lista de amistoso primeiro.</p>
            )}
          </>
        )}

        {message && <p role="status" className={`rounded-xl border p-3 text-xs font-bold ${message.type === "success" ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"}`}>{message.text}</p>}
      </div>

      {confirmReset && activeRound && (
        <div className="mobile-dialog-backdrop bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reset-test-title" onMouseDown={(event) => event.target === event.currentTarget && !pending && setConfirmReset(false)}>
          <div className="mobile-dialog-panel max-w-md rounded-[26px] border border-danger/30 bg-surface p-5 shadow-2xl animate-fade-in-up">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-danger/15 text-danger"><AlertTriangle className="h-6 w-6" /></div>
              <div className="min-w-0 flex-1"><h2 id="reset-test-title" className="text-lg font-black text-foreground">Resetar o teste?</h2><p className="mt-1 text-sm leading-5 text-muted">As escalações e a pontuação desta simulação serão apagadas. O amistoso e todos os dados oficiais permanecerão intactos.</p></div>
              <button type="button" disabled={pending} onClick={() => setConfirmReset(false)} aria-label="Fechar" className="rounded-full p-2 text-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" disabled={pending} onClick={() => setConfirmReset(false)} className="h-12 rounded-xl border border-border text-sm font-black text-muted disabled:opacity-50">Cancelar</button>
              <button type="button" disabled={pending} onClick={() => run(() => resetFantasyTestSession(activeRound.id), "Teste resetado sem alterar o Cartola oficial.", true)} className="h-12 rounded-xl bg-danger text-sm font-black text-white disabled:opacity-50">{pending ? "Resetando..." : "Resetar teste"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${date}T12:00:00`));
}

function statusLabel(status: string) {
  if (status === "open") return "Mercado aberto";
  if (status === "in_progress") return "Em andamento";
  return "Finalizado";
}
