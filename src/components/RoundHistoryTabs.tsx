"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { RoundStatisticEntry, RoundStatistics } from "@/lib/actions/stats";
import { Football, Medal, Target, Trophy } from "@/components/icons";
import { PlayerAvatar } from "@/components/PlayerAvatar";

type SortKey = "goals" | "assists" | "points" | "wins" | "losses" | "winRate";

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "goals", label: "Gols" },
  { key: "assists", label: "Assistências" },
  { key: "points", label: "Pontos" },
  { key: "wins", label: "Vitórias" },
  { key: "losses", label: "Derrotas" },
  { key: "winRate", label: "Aproveitamento" },
];

function names(entries: RoundStatisticEntry[]) {
  return entries.map((entry) => entry.player.name).join(" · ");
}

export function RoundHistoryTabs({ overview, statistics }: { overview: ReactNode; statistics: RoundStatistics }) {
  const [tab, setTab] = useState<"overview" | "statistics">("overview");
  const [sort, setSort] = useState<SortKey>("goals");
  const sortedEntries = useMemo(() => [...statistics.entries].sort((a, b) =>
    Number(b[sort]) - Number(a[sort])
      || b.goals - a.goals
      || b.assists - a.assists
      || b.points - a.points
      || a.player.name.localeCompare(b.player.name, "pt-BR"),
  ), [sort, statistics.entries]);

  const highlights = [
    statistics.highlights.scorers.length ? { label: "Artilharia", value: names(statistics.highlights.scorers), detail: `${statistics.highlights.scorers[0].goals} gol(s)`, icon: Football } : null,
    statistics.highlights.assisters.length ? { label: "Garçom", value: names(statistics.highlights.assisters), detail: `${statistics.highlights.assisters[0].assists} assistência(s)`, icon: Target } : null,
    statistics.highlights.topPoints.length ? { label: "Maior pontuação", value: names(statistics.highlights.topPoints), detail: `${statistics.highlights.topPoints[0].points} pts`, icon: Trophy } : null,
    statistics.highlights.goalkeepers.length ? { label: "Melhor goleiro", value: names(statistics.highlights.goalkeepers), detail: "Escolha da rodada", icon: Medal } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; detail: string; icon: typeof Trophy }>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 rounded-2xl border border-border bg-surface/70 p-1">
        <button type="button" onClick={() => setTab("overview")} className={`rounded-xl px-3 py-3 text-xs font-black transition-colors ${tab === "overview" ? "bg-accent text-background" : "text-muted"}`}>Visão geral</button>
        <button type="button" onClick={() => setTab("statistics")} className={`rounded-xl px-3 py-3 text-xs font-black transition-colors ${tab === "statistics" ? "bg-accent text-background" : "text-muted"}`}>Estatísticas</button>
      </div>

      {tab === "overview" ? overview : (
        <section className="space-y-5 animate-fade-in">
          {statistics.roundType === "friendly" && (
            <p className="rounded-xl border border-warning/25 bg-warning/10 p-3 text-xs font-bold text-warning">Amistoso: estes números ficam no histórico, mas não contam no Ranking oficial.</p>
          )}

          {highlights.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {highlights.map(({ label, value, detail, icon: Icon }) => (
                <div key={label} className="glass-card min-w-0 p-3">
                  <Icon className="h-5 w-5 text-accent" />
                  <p className="mt-2 text-[9px] font-black uppercase tracking-wider text-muted">{label}</p>
                  <p className="mt-1 line-clamp-2 text-xs font-black text-foreground">{value}</p>
                  <p className="mt-1 text-[10px] font-bold text-accent">{detail}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {sortOptions.filter((option) => statistics.roundType === "official" || option.key !== "points").map((option) => (
              <button key={option.key} type="button" onClick={() => setSort(option.key)} className={`shrink-0 rounded-full border px-3 py-2 text-[10px] font-black ${sort === option.key ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"}`}>{option.label}</button>
            ))}
          </div>

          <div className="space-y-2">
            {sortedEntries.map((entry, index) => (
              <div key={entry.player.id} className="glass-card flex items-center gap-3 p-3">
                <span className="stat-number w-6 shrink-0 text-center text-lg text-muted">{index + 1}</span>
                <PlayerAvatar name={entry.player.name} avatarUrl={entry.player.avatar_url} className="h-11 w-11 shrink-0 rounded-full bg-surface text-xs font-black text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-foreground">{entry.player.name}</p>
                  <p className="mt-1 text-[10px] font-bold text-muted">{entry.games}J · {entry.wins}V · {entry.draws}E · {entry.losses}D · {entry.winRate}%</p>
                  <p className="mt-0.5 text-[10px] text-muted">⚽ {entry.goals} · 🎯 {entry.assists}{entry.isBestGoalkeeper ? " · 🥇 goleiro" : ""}</p>
                </div>
                <div className="text-right">
                  <strong className="stat-number text-2xl text-accent">{entry[sort]}</strong>
                  <p className="text-[8px] font-black uppercase text-muted">{sortOptions.find((option) => option.key === sort)?.label}</p>
                </div>
              </div>
            ))}
            {sortedEntries.length === 0 && <p className="glass-card p-6 text-center text-sm text-muted">Nenhuma estatística consolidada nesta pelada.</p>}
          </div>
        </section>
      )}
    </div>
  );
}

