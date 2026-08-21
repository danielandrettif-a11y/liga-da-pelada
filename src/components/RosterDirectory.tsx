"use client";

import { useState, type ReactNode } from "react";
import type { Player } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayersStatsGrid, type PlayerStats } from "./PlayersStatsGrid";
import { RosterUnreadLink } from "./RosterUnreadLink";

type RosterFilter = "all" | "players" | "wags" | "supporters";
type StatsMode = "ranked" | "friendly";

type Props = {
  officialPlayers: Record<StatsMode, PlayerStats[]>;
  activeGuests: Record<StatsMode, PlayerStats[]>;
  wags: PlayerStats[];
  supporters: PlayerStats[];
  unreadPlayerIds?: string[];
  unreadSeenThrough?: string | null;
  seasonPass?: ReactNode;
};

const FILTERS: Array<{ value: RosterFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "players", label: "Jogadores" },
  { value: "wags", label: "WAGs" },
  { value: "supporters", label: "Torcida" },
];

function SectionDivider({ title, subtitle, count, tone = "accent" }: { title: string; subtitle: string; count: number; tone?: "accent" | "warning" | "muted" }) {
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
          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${toneClass}`}>{count}</span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted">{subtitle}</p>
      </div>
      <div className="h-px min-w-5 flex-1 bg-gradient-to-r from-border to-transparent" />
    </div>
  );
}

function CommunityGrid({ players, label, unreadPlayerIds, unreadSeenThrough }: { players: Player[]; label: "WAG" | "Torcida"; unreadPlayerIds: Set<string>; unreadSeenThrough: string | null }) {
  if (players.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted">Nenhum perfil nesta categoria.</div>;
  }

  return (
    <div className="grid min-w-0 grid-cols-2 gap-3">
      {players.map((player) => (
        <RosterUnreadLink key={player.id} href={`/jogadores/${player.id}`} unread={unreadPlayerIds.has(player.id)} seenThrough={unreadSeenThrough} className="glass-card glass-card-hover min-w-0 overflow-hidden p-3.5 text-center">
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

export function RosterDirectory({ officialPlayers, activeGuests, wags, supporters, unreadPlayerIds = [], unreadSeenThrough = null, seasonPass }: Props) {
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [statsMode, setStatsMode] = useState<StatsMode>("ranked");
  const unreadIds = new Set(unreadPlayerIds);
  const showPlayers = filter === "all" || filter === "players";
  const showWags = filter === "all" || filter === "wags";
  const showSupporters = filter === "all" || filter === "supporters";
  const visibleOfficialPlayers = officialPlayers[statsMode];
  const visibleGuests = activeGuests[statsMode];

  return (
    <div className="space-y-7">
      <div className="sticky top-20 z-30 -mx-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-xl shadow-black/20 backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-1" role="tablist" aria-label="Filtrar elenco por categoria">
          {FILTERS.map((item) => (
            <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)} className={`min-w-0 rounded-xl px-1 py-2.5 text-[10px] font-black transition-colors ${filter === item.value ? "bg-accent text-background shadow-[0_0_18px_rgba(204,255,0,.16)]" : "text-muted hover:bg-surface hover:text-foreground"}`}>
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
          <PlayersStatsGrid players={visibleOfficialPlayers} unreadPlayerIds={unreadIds} unreadSeenThrough={unreadSeenThrough} />
        </section>
      )}

      {showPlayers && visibleGuests.length > 0 && (
        <section className="scroll-mt-36 space-y-4">
          <SectionDivider title="Convidados" subtitle="Participações temporárias com histórico preservado" count={visibleGuests.length} tone="warning" />
          <PlayersStatsGrid players={visibleGuests} unreadPlayerIds={unreadIds} unreadSeenThrough={unreadSeenThrough} />
        </section>
      )}

      {filter === "all" && seasonPass}

      {showWags && (
        <section className="scroll-mt-36 space-y-4">
          <SectionDivider title="WAGs" subtitle="A comissão que acompanha a resenha" count={wags.length} tone="warning" />
          <CommunityGrid players={wags} label="WAG" unreadPlayerIds={unreadIds} unreadSeenThrough={unreadSeenThrough} />
        </section>
      )}

      {showSupporters && (
        <section className="scroll-mt-36 space-y-4">
          <SectionDivider title="Torcida" subtitle="Quem empurra a pelada do lado de fora" count={supporters.length} tone="muted" />
          <CommunityGrid players={supporters} label="Torcida" unreadPlayerIds={unreadIds} unreadSeenThrough={unreadSeenThrough} />
        </section>
      )}
    </div>
  );
}
