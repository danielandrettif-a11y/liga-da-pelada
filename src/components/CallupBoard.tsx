"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  Crown,
  ExternalLink,
  Loader2,
  LogIn,
  MapPin,
  Shield,
  Sparkles,
  Stadium as StadiumIcon,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserPlus,
  X,
} from "@/components/icons";
import {
  adminAddCallupPlayer,
  adminRemoveCallupPlayer,
  createCallupPrelist,
  joinActiveCallup,
  leaveActiveCallup,
  type CallupWithEntries,
} from "@/lib/actions/callups";
import type { Player } from "@/lib/types";
import type { FantasyQuickHighlight } from "@/lib/actions/fantasy";
import { PlayerAvatar } from "./PlayerAvatar";

type Props = {
  callup: CallupWithEntries;
  currentPlayerId: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  selectablePlayers: Player[];
  stadiumName?: string | null;
  stadiumMapUrl?: string | null;
  fantasyHighlights?: FantasyQuickHighlight | null;
};

export function CallupBoard({
  callup,
  currentPlayerId,
  isAuthenticated,
  isAdmin,
  selectablePlayers,
  stadiumName,
  stadiumMapUrl,
  fantasyHighlights,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [showCartolaPopup, setShowCartolaPopup] = useState(false);
  const confirmed = callup.entries.filter((entry) => entry.status === "confirmed");
  const waitlist = callup.entries.filter((entry) => entry.status === "waitlist");
  const capacity = callup.capacity;
  const waitlistCapacity = callup.waitlist_capacity;
  const myEntry = callup.entries.find((entry) => entry.player_id === currentPlayerId);
  const availableToAdmin = selectablePlayers.filter(
    (player) => !callup.entries.some((entry) => entry.player_id === player.id)
  );

  const startTime = callup.start_time ? callup.start_time.slice(0, 5) : "08:00";
  const formattedFullDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" })
    .format(new Date(`${callup.date}T12:00:00`));

  async function run(key: string, action: () => Promise<{ success: boolean; error?: string }>) {
    setLoading(key);
    setError("");
    const result = await action();
    if (!result.success) {
      setError(result.error || "Nao foi possivel atualizar a lista.");
    } else {
      if (key === "join") {
        setShowCartolaPopup(true);
      }
      router.refresh();
    }
    setLoading("");
  }

  async function copyInvite() {
    const type = callup.round_type === "friendly" ? "Amistoso" : "Pelada Oficial (Ranked)";
    const dateFormatted = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })
      .format(new Date(`${callup.date}T12:00:00`));
    const venueText = stadiumName ? `\n📍 Local: ${stadiumName}` : "";
    const mapText = stadiumMapUrl ? `\n🗺️ Como chegar: ${stadiumMapUrl}` : "";

    const text = `⚽ Convocação aberta para ${type}!\n📅 Data: ${dateFormatted}\n⏰ Horário: ${startTime}${venueText}${mapText}\n\n👉 Confirme sua presença: ${window.location.origin}/convocacao`;

    await navigator.clipboard.writeText(text);
    setLoading("copied");
    setTimeout(() => setLoading(""), 1600);
  }

  async function handlePrelist() {
    setLoading("prelist");
    setError("");
    const result = await createCallupPrelist(callup.id);
    if (!result.success || !result.roundId) {
      setError(result.error || "Nao foi possivel criar a pre-lista.");
      setLoading("");
      return;
    }
    router.push(`/admin/rodada?round=${result.roundId}`);
  }

  function EntryRow({ entry, position }: { entry: CallupWithEntries["entries"][number]; position: number }) {
    return (
      <div className="relative flex min-w-0 items-center gap-2 rounded-xl border border-border bg-background/45 p-2 pr-8">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface text-[10px] font-black text-muted">
          {position}
        </span>
        <PlayerAvatar
          name={entry.player.name}
          avatarUrl={entry.player.avatar_url}
          className="h-8 w-8 shrink-0 rounded-full bg-surface text-[9px] font-black text-muted"
        />
        <div className="min-w-0">
          <p className="line-clamp-2 text-[11px] font-black leading-3.5 text-foreground">{entry.player.name}</p>
          {entry.player.member_category === "guest" && (
            <span className="text-[7px] font-black uppercase text-warning">Convidado</span>
          )}
        </div>
        {isAdmin && callup.status === "open" && (
          <button
            onClick={() => run(`remove-${entry.id}`, () => adminRemoveCallupPlayer(callup.id, entry.player_id))}
            disabled={!!loading}
            className="absolute right-1 top-1 rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
            aria-label={`Remover ${entry.player.name}`}
          >
            {loading === `remove-${entry.id}` ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
    );
  }

  function EmptySlots({ start, total, label }: { start: number; total: number; label: string }) {
    if (total <= 0) return null;
    return (
      <div className="contents">
        {Array.from({ length: total }, (_, index) => (
          <div
            key={start + index}
            className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl border border-dashed border-border bg-background/20 px-2 py-2 text-[9px] text-muted"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface/60 font-black text-foreground/60">
              {start + index}
            </span>
            <span className="truncate">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 overflow-x-clip pb-3">
      {/* Card Principal da Convocação */}
      <section className="min-w-0 overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/15 via-surface to-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[9px] font-black uppercase text-background">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-background" /> Convocação aberta
            </div>
            <h1 className="text-2xl font-black text-foreground">
              {callup.round_type === "friendly" ? "Amistoso" : "Rodada oficial"}
            </h1>
          </div>
          <button
            onClick={copyInvite}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
            aria-label="Copiar convite"
          >
            {loading === "copied" ? <CheckCircle2 className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
          </button>
        </div>

        {/* AS 3 INFORMAÇÕES OBRIGATÓRIAS: DIA, HORÁRIO E ESTÁDIO */}
        <div className="mt-4 grid grid-cols-1 gap-2 border-t border-white/10 pt-4 sm:grid-cols-3">
          {/* 1. Dia */}
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background/50 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted">Dia</p>
              <p className="truncate text-xs font-black text-foreground capitalize">{formattedFullDate}</p>
            </div>
          </div>

          {/* 2. Horário */}
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background/50 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Clock className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted">Horário</p>
              <p className="text-xs font-black text-foreground">{startTime} (Início)</p>
            </div>
          </div>

          {/* 3. Estádio */}
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background/50 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <StadiumIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted">Estádio / Campo</p>
              <p className="truncate text-xs font-black text-foreground">{stadiumName || "Estádio da Pelada"}</p>
            </div>
            {stadiumMapUrl && (
              <a
                href={stadiumMapUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
                title="Abrir no Google Maps"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Contadores */}
        <div className="mt-4 grid min-w-0 grid-cols-2 gap-2.5">
          <div className="min-w-0 rounded-xl border border-border bg-background/40 p-3">
            <p className="text-2xl font-black text-accent">{confirmed.length}/{capacity}</p>
            <p className="truncate text-[9px] font-bold uppercase text-muted">Confirmados</p>
          </div>
          <div className="min-w-0 rounded-xl border border-border bg-background/40 p-3">
            <p className="text-2xl font-black text-warning">{waitlist.length}/{waitlistCapacity}</p>
            <p className="truncate text-[9px] font-bold uppercase text-muted">Na fila</p>
          </div>
        </div>
      </section>

      {/* Banner / Botão para ver onde fica no Google Maps */}
      {stadiumMapUrl && (
        <a
          href={stadiumMapUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-4 transition-colors hover:border-accent/40 hover:bg-accent/10"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <MapPin className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase tracking-wider text-muted">
              Local da pelada
            </span>
            <span className="mt-0.5 block text-sm font-black text-foreground">
              Veja onde fica o estádio no Google Maps
            </span>
            {stadiumName && <span className="mt-0.5 block truncate text-[11px] text-muted">{stadiumName}</span>}
          </span>
          <ExternalLink className="h-4 w-4 text-accent shrink-0" />
        </a>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-xs font-bold text-danger">
          {error}
        </div>
      )}

      {/* Ação do Administrador */}
      {isAdmin && (
        <section className="overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.06]">
          <div className="flex items-start gap-3 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground">Pré-lista da convocação</p>
              <p className="mt-1 text-[11px] leading-4 text-muted">
                Entradas e saídas atualizam automaticamente os jogadores da pré-lista.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handlePrelist}
            disabled={Boolean(loading)}
            className="flex w-full items-center justify-center gap-2 border-t border-accent/20 bg-accent px-4 py-3.5 text-sm font-black text-background disabled:opacity-50"
          >
            {loading === "prelist" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            {callup.round_id ? "Abrir pré-lista sincronizada" : "Fazer pré-lista"}
          </button>
        </section>
      )}

      {/* Botões de Ação do Jogador */}
      {callup.status === "locked" ? (
        <div className="rounded-xl border border-warning/25 bg-warning/10 p-4 text-sm font-bold text-warning">
          Lista fechada pelo ADM. Os times estão sendo montados.
        </div>
      ) : !isAuthenticated ? (
        <Link
          href="/login?next=/convocacao"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-black text-background shadow-[0_0_20px_rgba(204,255,0,.15)]"
        >
          <LogIn className="h-5 w-5" /> Entrar para confirmar presença
        </Link>
      ) : myEntry ? (
        <button
          onClick={() => run("leave", () => leaveActiveCallup(callup.id))}
          disabled={!!loading}
          className="w-full rounded-xl border border-danger/35 py-3.5 text-sm font-black text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
        >
          {loading === "leave" ? "Saindo..." : myEntry.status === "confirmed" ? "Desistir da vaga" : "Sair da fila"}
        </button>
      ) : currentPlayerId ? (
        <button
          onClick={() => run("join", () => joinActiveCallup(callup.id))}
          disabled={!!loading}
          className={`w-full rounded-xl py-3.5 text-sm font-black text-background transition-transform active:scale-[0.99] disabled:opacity-50 ${
            confirmed.length < capacity ? "bg-accent shadow-[0_0_20px_rgba(204,255,0,.15)]" : "bg-warning shadow-[0_0_20px_rgba(234,179,8,.15)]"
          }`}
        >
          {loading === "join"
            ? "Confirmando..."
            : confirmed.length < capacity
            ? "Confirmar presença"
            : "Entrar na fila de espera"}
        </button>
      ) : (
        <div className="rounded-xl border border-warning/25 bg-warning/10 p-4 text-xs font-bold text-warning">
          Sua conta ainda não está vinculada a um jogador selecionável.
        </div>
      )}

      {/* Lista de Confirmados */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black uppercase tracking-wider text-muted">Confirmados ({confirmed.length}/{capacity})</h2>
          <CheckCircle2 className="h-4 w-4 text-accent" />
        </div>
        <div className="glass-card grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          {confirmed.map((entry, index) => (
            <EntryRow key={entry.id} entry={entry} position={index + 1} />
          ))}
          <EmptySlots start={confirmed.length + 1} total={capacity - confirmed.length} label="Livre" />
        </div>
      </section>

      {/* Lista de Fila de Espera */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black uppercase tracking-wider text-muted">Fila de espera ({waitlist.length}/{waitlistCapacity})</h2>
          <Clock className="h-4 w-4 text-warning" />
        </div>
        <div className="glass-card grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          {waitlist.map((entry, index) => (
            <EntryRow key={entry.id} entry={entry} position={index + 1} />
          ))}
          <EmptySlots start={waitlist.length + 1} total={waitlistCapacity - waitlist.length} label="Livre" />
        </div>
      </section>

      {/* Gestão do ADM */}
      {isAdmin && callup.status === "open" && (
        <section className="glass-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-black text-foreground">Gestão do ADM</h2>
          </div>
          <div className="flex gap-2">
            <select
              id="admin-callup-player"
              defaultValue=""
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-3 text-xs text-foreground"
            >
              <option value="" disabled>
                Adicionar jogador ou convidado
              </option>
              {availableToAdmin.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                  {player.member_category === "guest" ? " (convidado)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const select = document.getElementById("admin-callup-player") as HTMLSelectElement;
                if (select?.value) run("add", () => adminAddCallupPlayer(callup.id, select.value));
              }}
              disabled={!!loading}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-background"
            >
              <UserPlus className="h-5 w-5" />
            </button>
          </div>
        </section>
      )}

      {/* POPUP PÓS-CONFIRMAÇÃO: CHAMADA PARA O CARTOLA */}
      {showCartolaPopup && (
        <div
          className="mobile-dialog-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setShowCartolaPopup(false)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Presença confirmada"
          >
            {/* Fechar */}
            <button
              onClick={() => setShowCartolaPopup(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Ícone de Sucesso */}
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-background shadow-[0_0_30px_rgba(204,255,0,0.3)]">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <div className="mt-4 text-center">
              <span className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-accent">
                Presença Confirmada!
              </span>
              <h2 className="mt-1 font-athletic text-2xl font-black uppercase italic leading-tight text-white">
                Você está escalado!
              </h2>
              <p className="mt-1 text-xs text-muted">
                Sua vaga de titular está garantida para a pelada. Agora escale seu time no Cartola antes do fechamento!
              </p>
            </div>

            {/* Mini Resumo / Destaques da Rodada Anterior */}
            <div className="mt-5 space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-left">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-warning">
                  <Sparkles className="h-3.5 w-3.5" /> Destaques do Cartola
                </span>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[8px] font-black uppercase text-accent">
                  Mercado Aberto
                </span>
              </div>

              {fantasyHighlights?.topScorer && (
                <div className="flex items-center justify-between border-t border-white/5 pt-2 text-xs">
                  <span className="flex items-center gap-1.5 text-muted">
                    <Trophy className="h-3.5 w-3.5 text-yellow-400" /> Mito Anterior
                  </span>
                  <span className="font-black text-foreground">
                    {fantasyHighlights.topScorer.name}{" "}
                    <strong className="text-accent">({fantasyHighlights.topScorer.points.toFixed(1)} pts)</strong>
                  </span>
                </div>
              )}

              {fantasyHighlights?.topGain && (
                <div className="flex items-center justify-between border-t border-white/5 pt-2 text-xs">
                  <span className="flex items-center gap-1.5 text-muted">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Maior Valorização
                  </span>
                  <span className="font-black text-emerald-400">
                    {fantasyHighlights.topGain.name} (+{(fantasyHighlights.topGain.variation * 100).toFixed(0)}%)
                  </span>
                </div>
              )}

              {fantasyHighlights?.topDrop && (
                <div className="flex items-center justify-between border-t border-white/5 pt-2 text-xs">
                  <span className="flex items-center gap-1.5 text-muted">
                    <TrendingDown className="h-3.5 w-3.5 text-rose-400" /> Maior Desvalorização
                  </span>
                  <span className="font-black text-rose-400">
                    {fantasyHighlights.topDrop.name} ({(fantasyHighlights.topDrop.variation * 100).toFixed(0)}%)
                  </span>
                </div>
              )}
            </div>

            {/* Ações */}
            <div className="mt-5 space-y-2">
              <Link
                href="/cartola"
                onClick={() => setShowCartolaPopup(false)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_20px_rgba(204,255,0,0.2)] transition-transform active:scale-95"
              >
                <Crown className="h-4 w-4" /> Escalar no Cartola Agora
              </Link>
              <button
                onClick={() => setShowCartolaPopup(false)}
                className="w-full rounded-xl border border-white/10 py-2.5 text-xs font-bold text-muted hover:text-foreground transition-colors"
              >
                Ver convocação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
