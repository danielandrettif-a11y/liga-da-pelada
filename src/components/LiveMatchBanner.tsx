"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Clock3, Radio } from "@/components/icons";
import { supabase } from "@/lib/supabase";

export type HomeLiveMatch = {
  id: string;
  score_a: number;
  score_b: number;
  status: string;
  timer_started_at: string | null;
  timer_accumulated_seconds: number | null;
  round: { id: string; number: number } | null;
  teamA: { id: string; name: string; color: string } | null;
  teamB: { id: string; name: string; color: string } | null;
};

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function LiveMatchBanner({
  initialMatch,
  matchDuration,
}: {
  initialMatch: HomeLiveMatch | null;
  matchDuration: number;
}) {
  const router = useRouter();
  const [match, setMatch] = useState(initialMatch);
  const [now, setNow] = useState(() => Date.now());
  const matchId = match?.id || null;

  useEffect(() => setMatch(initialMatch), [initialMatch]);

  useEffect(() => {
    if (!match?.timer_started_at) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [match?.timer_started_at]);

  useEffect(() => {
    const channel = supabase
      .channel("home-live-match")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, (payload) => {
        const changedMatch = payload.new as Partial<HomeLiveMatch> & { id?: string };

        if (!matchId && changedMatch.status === "live") {
          router.refresh();
          return;
        }

        if (!matchId || changedMatch.id !== matchId) return;
        if (changedMatch.status && changedMatch.status !== "live") {
          router.refresh();
          return;
        }

        setMatch((current) => current ? { ...current, ...changedMatch } : current);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, router]);

  if (!match) return null;

  const accumulated = match.timer_accumulated_seconds || 0;
  const runningSeconds = match.timer_started_at
    ? Math.max(0, Math.floor((now - new Date(match.timer_started_at).getTime()) / 1000))
    : 0;
  const secondsLeft = Math.max(0, matchDuration * 60 - accumulated - runningSeconds);
  const isPaused = !match.timer_started_at;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-red-500/45 bg-[#07100b] shadow-[0_14px_45px_rgba(0,0,0,.35)] animate-fade-in">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />
      <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-red-500/10 blur-3xl" />

      <div className="relative flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white">
            <Radio className="h-3 w-3 animate-pulse" />
            Ao vivo
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">
            Rodada {String(match.round?.number || 0).padStart(2, "0")}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-xs font-black ${isPaused ? "bg-amber-500/15 text-amber-300" : "bg-white/10 text-white"}`}>
          <Clock3 className="h-3.5 w-3.5" />
          {formatClock(secondsLeft)}
        </div>
      </div>

      <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-5">
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <span className="h-4 w-4 rounded-full border-2 border-white/20 shadow-lg" style={{ backgroundColor: match.teamA?.color || "#3b82f6" }} />
          <p className="w-full truncate text-sm font-black text-white">{match.teamA?.name || "Time A"}</p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-4 py-2 shadow-inner">
          <span className="stat-number text-4xl text-white">{match.score_a}</span>
          <span className="text-sm font-black text-white/35">×</span>
          <span className="stat-number text-4xl text-white">{match.score_b}</span>
        </div>

        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <span className="h-4 w-4 rounded-full border-2 border-white/20 shadow-lg" style={{ backgroundColor: match.teamB?.color || "#ef4444" }} />
          <p className="w-full truncate text-sm font-black text-white">{match.teamB?.name || "Time B"}</p>
        </div>
      </div>

      <Link
        href={`/partidas/${match.id}`}
        className="relative flex items-center justify-between border-t border-white/10 bg-white/[0.035] px-4 py-3 text-xs font-bold text-white transition-colors hover:bg-white/[0.07]"
      >
        <span>{isPaused ? "Cronômetro pausado" : "Acompanhar a transmissão"}</span>
        <span className="flex items-center gap-1 text-accent">
          Abrir partida
          <ChevronRight className="h-4 w-4" />
        </span>
      </Link>
    </section>
  );
}
