"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Shield } from "@/components/icons";
import type { Player } from "@/lib/types";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerProfileBadge } from "./PlayerProfileBadge";

type Filter = "all" | "players" | "guests" | "community";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "players", label: "Jogadores" },
  { value: "guests", label: "Convidados" },
  { value: "community", label: "Comunidade" },
];

function PersonCard({ player, isAdmin }: { player: Player; isAdmin: boolean }) {
  const category = player.member_category === "player" ? "Jogador" : player.member_category === "guest" ? (player.is_selectable ? "Convidado" : "Arquivado") : player.member_category === "wag" ? "WAG" : "Torcida";
  return (
    <Link href={`/admin/jogadores/${player.id}/editar`} className="glass-card glass-card-hover flex min-w-0 items-center gap-3 p-3.5">
      <PlayerAvatar name={player.name} avatarUrl={player.avatar_url} className="h-11 w-11 shrink-0 rounded-full border border-border bg-surface text-xs font-black text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="max-w-full truncate text-sm font-black text-foreground">{player.name}</p>
          {isAdmin && <span className="inline-flex items-center gap-1 rounded-full border border-warning/35 bg-warning/10 px-2 py-0.5 text-[8px] font-black uppercase text-warning"><Shield className="h-3 w-3" /> ADM</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-border px-2 py-0.5 text-[8px] font-black uppercase text-muted">{category}</span>
          {player.player_profile && <PlayerProfileBadge profile={player.player_profile} isGoalkeeper={player.is_goalkeeper} />}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  );
}

function Group({ title, subtitle, players, adminIds }: { title: string; subtitle: string; players: Player[]; adminIds: Set<string> }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div><h2 className="text-sm font-black text-foreground">{title}</h2><p className="mt-0.5 text-[10px] text-muted">{subtitle}</p></div>
        <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[9px] font-black text-muted">{players.length}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {players.map((player) => <PersonCard key={player.id} player={player} isAdmin={adminIds.has(player.id)} />)}
        {players.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-border p-5 text-center text-xs text-muted">Nenhum perfil nesta categoria.</div>}
      </div>
    </section>
  );
}

export function AdminRosterDirectory({ players, adminPlayerIds }: { players: Player[]; adminPlayerIds: string[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const adminIds = new Set(adminPlayerIds);
  const official = players.filter((player) => player.member_category === "player");
  const activeGuests = players.filter((player) => player.member_category === "guest" && player.is_selectable);
  const archivedGuests = players.filter((player) => player.member_category === "guest" && !player.is_selectable);
  const wags = players.filter((player) => player.member_category === "wag");
  const supporters = players.filter((player) => player.member_category === "supporter");

  return (
    <div className="space-y-7">
      <div className="sticky top-20 z-30 grid grid-cols-4 gap-1 rounded-2xl border border-border bg-background/95 p-1.5 shadow-xl shadow-black/20 backdrop-blur-xl" role="tablist" aria-label="Filtrar gerenciamento do elenco">
        {FILTERS.map((item) => <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)} className={`min-w-0 rounded-xl px-1 py-2.5 text-[9px] font-black transition-colors ${filter === item.value ? "bg-accent text-background" : "text-muted hover:bg-surface"}`}><span className="block truncate">{item.label}</span></button>)}
      </div>

      {(filter === "all" || filter === "players") && <Group title="Jogadores oficiais" subtitle="Atletas ativos no Ranked" players={official} adminIds={adminIds} />}
      {(filter === "all" || filter === "guests") && <Group title="Convidados ativos" subtitle="Disponíveis para convocação" players={activeGuests} adminIds={adminIds} />}
      {(filter === "all" || filter === "guests") && <Group title="Convidados arquivados" subtitle="Histórico preservado após a participação" players={archivedGuests} adminIds={adminIds} />}
      {(filter === "all" || filter === "community") && <Group title="WAGs" subtitle="Comunidade fora das quatro linhas" players={wags} adminIds={adminIds} />}
      {(filter === "all" || filter === "community") && <Group title="Torcida" subtitle="Quem acompanha a pelada" players={supporters} adminIds={adminIds} />}
    </div>
  );
}
