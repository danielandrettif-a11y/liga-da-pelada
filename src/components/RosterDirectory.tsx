"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Player } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayersStatsGrid, type PlayerStats } from "./PlayersStatsGrid";
import { RosterUnreadLink } from "./RosterUnreadLink";
import { markRosterActivitySeen } from "@/lib/actions/registrations";
import { Crown } from "@/components/icons";

type RosterFilter = "all" | "players" | "wags" | "supporters";
type RosterView = "roster" | "pass";
type StatsMode = "ranked" | "friendly";

type Props = {
  officialPlayers: Record<StatsMode, PlayerStats[]>;
  activeGuests: Record<StatsMode, PlayerStats[]>;
  wags: PlayerStats[];
  supporters: PlayerStats[];
  unreadPlayerIds?: string[];
  unreadSeenThrough?: string | null;
  initialView?: RosterView;
  seasonPass?: ReactNode;
  seasonPassProgress?: number;
  seasonPassMaxProgress?: number;
};

const FILTERS: Array<{ value: RosterFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "players", label: "Jogadores" },
  { value: "wags", label: "WAGs" },
  { value: "supporters", label: "Torcida" },
];

function SectionDivider({ title, subtitle, count, tone = "accent" }: { title: string; subtitle: string; count?: number; tone?: "accent" | "warning" | "muted" }) {
  const toneClass = tone === "warning"
    ? "border-warning/30 bg-warning/10 text-warning"
    : tone === "muted"
      ? "border-border bg-surface text-muted"
      : "border-accent/30 bg-accent/10 text-accent";

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="whitespace-nowrap text-sm font-black text-foreground">{title}</h2>
          {count != null && <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${toneClass}`}>{count}</span>}
        </div>
        <p className="mt-0.5 text-[10px] text-muted">{subtitle}</p>
      </div>
      <div className="h-px min-w-5 flex-1 bg-gradient-to-r from-border to-transparent" />
    </div>
  );
}

function CommunityGrid({ players, label, unreadPlayerIds }: { players: Player[]; label: "WAG" | "Torcida"; unreadPlayerIds: Set<string> }) {
  if (players.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted">Nenhum perfil nesta categoria.</div>;
  }

  return (
    <div className="grid min-w-0 grid-cols-2 gap-3">
      {players.map((player) => (
        <RosterUnreadLink key={player.id} href={`/jogadores/${player.id}`} unread={unreadPlayerIds.has(player.id)} className="glass-card glass-card-hover min-w-0 overflow-hidden p-3.5 text-center">
          <div className="relative mx-auto w-fit">
            <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} className="h-20 w-20 rounded-full border-2 border-accent/25 bg-surface text-lg font-black text-muted ring-4 ring-background" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-accent/25 bg-background px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-accent">{label}</span>
          </div>
          <p className="mt-3 truncate text-sm font-black text-foreground">{player.name}</p>
          {player.nickname && <p className="mt-0.5 truncate text-[10px] italic text-muted">“{player.nickname}”</p>}
        </RosterUnreadLink>
      ))}
    </div>
  );
}

export function RosterDirectory({ officialPlayers, activeGuests, wags, supporters, unreadPlayerIds = [], unreadSeenThrough = null, initialView = "roster", seasonPass, seasonPassProgress, seasonPassMaxProgress = 40 }: Props) {
  const router = useRouter();
  const [view, setView] = useState<RosterView>(initialView);
  const [passPending, startPassTransition] = useTransition();
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [statsMode, setStatsMode] = useState<StatsMode>("ranked");
  const [visibleUnreadPlayerIds, setVisibleUnreadPlayerIds] = useState(unreadPlayerIds);
  const passPanelRef = useRef<HTMLElement>(null);
  const unreadIds = new Set(visibleUnreadPlayerIds);
  const showPlayers = filter === "all" || filter === "players";
  const showWags = filter === "all" || filter === "wags";
  const showSupporters = filter === "all" || filter === "supporters";
  const visibleOfficialPlayers = officialPlayers[statsMode];
  const visibleGuests = activeGuests[statsMode];

  useEffect(() => setView(initialView), [initialView]);
  useEffect(() => setVisibleUnreadPlayerIds(unreadPlayerIds), [unreadPlayerIds]);

  // A visita ao Elenco é a confirmação de leitura. Antes, a confirmação só
  // ocorria se o card individual atingisse 55% da tela, o que fazia o aviso
  // voltar quando a pessoa já tinha visto a novidade pela própria aba.
  useEffect(() => {
    if (view !== "roster" || !unreadSeenThrough || visibleUnreadPlayerIds.length === 0) return;

    let cancelled = false;
    // O RPC grava o horario do proprio banco. Isso evita o badge reaparecer por
    // diferencas de relogio ou por um evento com o mesmo timestamp do cursor.
    void markRosterActivitySeen().then((result) => {
      if (cancelled || !result.success) return;
      setVisibleUnreadPlayerIds([]);
      window.dispatchEvent(new CustomEvent("roster-unread-cleared"));
    });

    return () => {
      cancelled = true;
    };
  }, [unreadSeenThrough, view, visibleUnreadPlayerIds.length]);

  useEffect(() => {
    if (view !== "pass") return;

    const frame = window.requestAnimationFrame(() => {
      passPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  function openSeasonPass() {
    if (seasonPass) {
      setView("pass");
      return;
    }
    startPassTransition(() => router.push("/jogadores?tab=passe"));
  }

  return (
    <div className="space-y-7">
      <div className="sticky top-20 z-30 -mx-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-xl shadow-black/20 backdrop-blur-xl">
        <div className="grid grid-cols-2 gap-1" role="tablist" aria-label="Alternar entre elenco e passe de temporada">
          <button type="button" role="tab" aria-selected={view === "roster"} onClick={() => setView("roster")} className={`rounded-xl py-3 text-xs font-black transition-colors ${view === "roster" ? "bg-accent text-background shadow-[0_0_18px_rgba(204,255,0,.16)]" : "text-muted hover:bg-surface hover:text-foreground"}`}>Elenco</button>
          <button type="button" role="tab" aria-selected={view === "pass"} disabled={passPending} onClick={openSeasonPass} className={`relative overflow-hidden rounded-xl border px-2 py-1.5 text-left transition-all disabled:opacity-70 ${view === "pass" ? "border-[#cd91ff] bg-gradient-to-r from-[#7734bb] to-[#a35bea] text-white shadow-[0_0_20px_rgba(159,92,255,.42)]" : "border-[#a761e8]/65 bg-gradient-to-r from-[#27103f] to-[#3f1a63] text-[#f0dfff] shadow-[0_0_16px_rgba(159,92,255,.16)] hover:brightness-110"}`}>
            <span className="pointer-events-none absolute -right-3 -top-5 h-16 w-16 rounded-full bg-[#d5ff37]/15 blur-xl" />
            <span className="relative flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-black/15 text-[#e7c8ff]"><Crown className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[11px] font-black leading-none">Passe BQ</span><span className="mt-1 block text-[8px] font-bold uppercase tracking-[0.12em] text-white/70">Sua trilha</span></span>
              <span className="shrink-0 rounded-lg bg-black/20 px-1.5 py-1 text-[9px] font-black text-[#d5ff37]">{passPending ? "..." : seasonPassProgress == null ? "Abrir" : `${seasonPassProgress}/${seasonPassMaxProgress}`}</span>
            </span>
          </button>
        </div>
      </div>

      {view === "roster" && <>
        <div className="rounded-2xl border border-border bg-surface p-1.5">
          <div className="grid grid-cols-4 gap-1" role="tablist" aria-label="Filtrar elenco por categoria">
          {FILTERS.map((item) => (
            <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)} className={`min-w-0 rounded-xl px-1 py-2.5 text-[10px] font-black transition-colors ${filter === item.value ? "bg-accent text-background shadow-[0_0_18px_rgba(204,255,0,.16)]" : "text-muted hover:bg-background hover:text-foreground"}`}>
              <span className="block truncate">{item.label}</span>
            </button>
          ))}
          </div>
        </div>

      {showPlayers && (
        <div className="rounded-2xl border border-border bg-surface p-1.5">
          <p className="px-2 pb-1.5 pt-1 text-[9px] font-black uppercase tracking-[0.16em] text-muted">Estatísticas exibidas</p>
          <div className="grid grid-cols-2 gap-1" role="tablist" aria-label="Alternar estatísticas por modo de jogo">
            <button type="button" role="tab" aria-selected={statsMode === "ranked"} onClick={() => setStatsMode("ranked")} className={`rounded-xl py-2.5 text-[11px] font-black transition-colors ${statsMode === "ranked" ? "bg-accent text-background" : "text-muted hover:bg-background"}`}>
              Ranked
            </button>
            <button type="button" role="tab" aria-selected={statsMode === "friendly"} onClick={() => setStatsMode("friendly")} className={`rounded-xl py-2.5 text-[11px] font-black transition-colors ${statsMode === "friendly" ? "bg-warning text-background" : "text-muted hover:bg-background"}`}>
              Amistosos
            </button>
          </div>
        </div>
      )}

      {showPlayers && (
        <section className="scroll-mt-36 space-y-4">
          <SectionDivider title="Jogadores oficiais" subtitle={statsMode === "ranked" ? "Atletas que disputam o Ranked" : "Desempenho separado nos amistosos"} count={visibleOfficialPlayers.length} />
          <PlayersStatsGrid players={visibleOfficialPlayers} unreadPlayerIds={unreadIds} />
        </section>
      )}

      {showPlayers && visibleGuests.length > 0 && (
        <section className="scroll-mt-36 space-y-4">
          <SectionDivider title="Convidados" subtitle="Participações temporárias com histórico preservado" count={visibleGuests.length} tone="warning" />
          <PlayersStatsGrid players={visibleGuests} unreadPlayerIds={unreadIds} />
        </section>
      )}

      {showWags && (
        <section className="scroll-mt-36 space-y-4">
          <SectionDivider title="WAGs" subtitle="A comissão que acompanha a resenha" count={wags.length} tone="warning" />
          <CommunityGrid players={wags} label="WAG" unreadPlayerIds={unreadIds} />
        </section>
      )}

      {showSupporters && (
        <section className="scroll-mt-36 space-y-4">
          <SectionDivider title="Torcida" subtitle="Quem empurra a pelada do lado de fora" count={supporters.length} tone="muted" />
          <CommunityGrid players={supporters} label="Torcida" unreadPlayerIds={unreadIds} />
        </section>
      )}
      </>}

      {view === "pass" && <section ref={passPanelRef} className="scroll-mt-36">{seasonPass}</section>}
    </div>
  );
}
