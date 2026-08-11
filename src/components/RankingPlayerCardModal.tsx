"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Medal, Sparkles, Target, Trophy, X } from "@/components/icons";
import type { RankingEntry } from "@/lib/ranking";
import { PlayerAvatar } from "./PlayerAvatar";

type Props = {
  entry: RankingEntry;
  position: number;
  onClose: () => void;
};

const PROFILE_LABELS = {
  offensive: "ATA",
  midfield: "MEI",
  defensive: "DEF",
};

function cardTheme(position: number) {
  if (position === 1) return { base: "#c99520", light: "#fff0a6", deep: "#6f4806", edge: "#fff5bd", ink: "#2d2106", glow: "rgba(255,199,47,.42)", label: "OURO" };
  if (position === 2) return { base: "#a8b1bd", light: "#f8fbff", deep: "#515b68", edge: "#ffffff", ink: "#17202a", glow: "rgba(210,224,240,.35)", label: "PRATA" };
  if (position === 3) return { base: "#a9612f", light: "#f0c09a", deep: "#512713", edge: "#f4c8a6", ink: "#2c150a", glow: "rgba(195,105,53,.38)", label: "BRONZE" };
  return { base: "#123e28", light: "#4f8d67", deep: "#06150d", edge: "#bdfb68", ink: "#f7fff9", glow: "rgba(204,255,0,.2)", label: "ESPECIAL" };
}

export function RankingPlayerCardModal({ entry, position, onClose }: Props) {
  const theme = cardTheme(position);
  const displayName = entry.player.name;
  const profile = `${PROFILE_LABELS[entry.player.player_profile || "midfield"]}${entry.player.is_goalkeeper ? " / GOL" : ""}`;
  const awardBadges = [
    { label: "Artilheiro", value: entry.awards.topScorer, Icon: Target },
    { label: "Garçom", value: entry.awards.topAssister, Icon: Sparkles },
    { label: "Goleiro", value: entry.awards.bestGoalkeeper, Icon: Medal },
  ].filter((award) => award.value > 0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const clipPath = "polygon(10% 0, 90% 0, 100% 7%, 97% 88%, 50% 100%, 3% 88%, 0 7%)";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/90 p-3 backdrop-blur-md" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Carta de ${displayName}`} className="relative w-full max-w-[350px] py-12">
        <button type="button" onClick={onClose} aria-label="Fechar carta" className="absolute right-1 top-1 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-lg backdrop-blur hover:bg-black/90">
          <X className="h-5 w-5" />
        </button>

        <div className="relative p-[3px]" style={{ clipPath, background: `linear-gradient(145deg, ${theme.edge}, ${theme.deep} 48%, ${theme.light})`, filter: `drop-shadow(0 26px 36px ${theme.glow})` }}>
          <div className="relative overflow-hidden px-6 pb-12 pt-6" style={{ clipPath, color: theme.ink, background: `linear-gradient(155deg, ${theme.light} 0%, ${theme.base} 42%, ${theme.deep} 115%)` }}>
            <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(120deg, transparent 0 22px, rgba(255,255,255,.2) 23px 24px), radial-gradient(circle at 72% 14%, rgba(255,255,255,.85), transparent 28%)" }} />
            <div className="pointer-events-none absolute -left-16 top-32 h-32 w-[140%] -rotate-12 border-y border-white/25 bg-white/10" />
            <div className="pointer-events-none absolute inset-3 border border-current/20" style={{ clipPath }} />

            <header className="relative z-10 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.22em]">
              <span>PBQ · Temporada</span>
              <span className="rounded-full border border-current/25 bg-white/15 px-2.5 py-1">Carta {theme.label}</span>
            </header>

            <div className="relative z-10 mt-2 h-52">
              <div className="absolute left-0 top-5 z-20 flex w-20 flex-col items-center font-athletic">
                <span className="player-card-rating text-6xl">{entry.points}</span>
                <span className="-mt-1 text-xs font-black tracking-[0.25em]">PTS</span>
                <div className="my-2 h-px w-12 bg-current opacity-30" />
                <span className="text-center text-xl font-black leading-5">{profile}</span>
                <div className="mt-3 flex h-10 w-10 items-center justify-center rounded-full border border-current/25 bg-white/15 shadow-inner">
                  <Trophy className="h-6 w-6" fill="currentColor" />
                </div>
              </div>

              <div className="absolute -right-5 bottom-0 h-52 w-56">
                <div className="absolute inset-x-5 bottom-1 h-10 rounded-full bg-black/35 blur-xl" />
                <PlayerAvatar name={entry.player.name} avatarUrl={entry.player.avatar_url} className="relative h-full w-full bg-transparent text-6xl font-black" imageClassName="object-cover object-top" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16" style={{ background: `linear-gradient(transparent, ${theme.base})` }} />
              </div>

              <div className="absolute bottom-1 left-0 z-20 flex h-7 w-7 items-center justify-center rounded-md border border-current/25 bg-white/15 font-athletic text-sm font-black">{position}º</div>
            </div>

            <div className="relative z-10 -mt-1 border-y border-current/30 bg-white/10 px-2 py-3 text-center backdrop-blur-sm">
              <h2 className="truncate font-athletic text-2xl font-black uppercase tracking-wide">{displayName}</h2>
              {entry.player.nickname && <p className="mt-0.5 truncate text-[10px] font-bold italic opacity-75">“{entry.player.nickname}”</p>}
            </div>

            <div className="relative z-10 mt-4 grid grid-cols-3 gap-x-2 gap-y-3 font-athletic">
              {[
                [entry.goals, "GOL"], [entry.assists, "AST"], [entry.wins, "VIT"],
                [entry.games, "JOG"], [entry.losses, "DER"], [`${entry.winRate}%`, "APR"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg border border-current/15 bg-white/10 px-1 py-2 text-center shadow-inner">
                  <p className="player-card-number text-2xl">{value}</p>
                  <p className="mt-1 text-[9px] font-black tracking-[0.18em] opacity-70">{label}</p>
                </div>
              ))}
            </div>

            {awardBadges.length > 0 && (
              <div className="relative z-10 mt-4 flex flex-wrap justify-center gap-1.5">
                {awardBadges.map(({ label, value, Icon }) => <span key={label} className="inline-flex items-center gap-1 rounded-full border border-current/20 bg-white/15 px-2 py-1 text-[8px] font-black uppercase"><Icon className="h-3 w-3" />{label} {value}x</span>)}
              </div>
            )}

            {entry.fitness && (
              <div className="relative z-10 mt-4 grid grid-cols-2 gap-2 border-t border-current/25 pt-3 text-center">
                <div><p className="font-athletic text-lg font-black">{entry.fitness.distanceKm} km</p><p className="text-[8px] font-black uppercase opacity-65">Distância Ranked</p></div>
                <div><p className="font-athletic text-lg font-black">{entry.fitness.averageSpeedKmh} km/h</p><p className="text-[8px] font-black uppercase opacity-65">Velocidade média</p></div>
              </div>
            )}
          </div>
        </div>

        <Link href={`/jogadores/${entry.player.id}`} className="mx-auto mt-5 flex w-[88%] items-center justify-center rounded-xl bg-accent py-3.5 text-sm font-black uppercase tracking-wide text-background shadow-lg shadow-accent/15">Abrir perfil completo</Link>
      </div>
    </div>
  );
}
