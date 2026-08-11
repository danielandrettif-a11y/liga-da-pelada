"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Crown, Medal, Trophy, X } from "@/components/icons";
import type { RankingEntry } from "@/lib/ranking";
import { PlayerAvatar } from "./PlayerAvatar";
import { PlayerAwards } from "./PlayerAwards";

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
  if (position === 1) {
    return {
      surface: "linear-gradient(145deg, #fff5bd 0%, #d7ad3d 42%, #8f6412 100%)",
      border: "#fff2a8",
      ink: "#35280c",
      subtle: "rgba(53, 40, 12, 0.7)",
      glow: "rgba(245, 193, 57, 0.4)",
      label: "OURO",
    };
  }
  if (position === 2) {
    return {
      surface: "linear-gradient(145deg, #f8fafc 0%, #aeb8c4 45%, #687481 100%)",
      border: "#f8fafc",
      ink: "#18222d",
      subtle: "rgba(24, 34, 45, 0.68)",
      glow: "rgba(203, 213, 225, 0.35)",
      label: "PRATA",
    };
  }
  if (position === 3) {
    return {
      surface: "linear-gradient(145deg, #efc29a 0%, #a96732 46%, #5f321a 100%)",
      border: "#f2c7a4",
      ink: "#30190d",
      subtle: "rgba(48, 25, 13, 0.72)",
      glow: "rgba(180, 103, 52, 0.4)",
      label: "BRONZE",
    };
  }
  return {
    surface: "linear-gradient(145deg, #143725 0%, #092116 48%, #06130d 100%)",
    border: "#3b7655",
    ink: "#f8fafc",
    subtle: "#9ab7a5",
    glow: "rgba(204, 255, 0, 0.16)",
    label: "ESPECIAL",
  };
}

export function RankingPlayerCardModal({ entry, position, onClose }: Props) {
  const theme = cardTheme(position);
  const displayName = entry.player.name;
  const awardSeasons = [...entry.awardSeasons].sort((a, b) => a.seasonNumber - b.seasonNumber);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={`Carta de ${displayName}`} className="relative w-full max-w-[340px] py-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar carta"
          className="absolute right-0 top-0 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white hover:bg-black/80"
        >
          <X className="h-5 w-5" />
        </button>

        <div
          className="relative overflow-hidden px-7 pb-10 pt-9 shadow-2xl"
          style={{
            clipPath: "polygon(12% 0, 88% 0, 100% 8%, 100% 90%, 50% 100%, 0 90%, 0 8%)",
            background: theme.surface,
            border: `2px solid ${theme.border}`,
            color: theme.ink,
            filter: `drop-shadow(0 24px 32px ${theme.glow})`,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage: "repeating-linear-gradient(125deg, transparent 0 18px, rgba(255,255,255,.28) 18px 20px), radial-gradient(circle at 70% 18%, rgba(255,255,255,.7), transparent 34%)",
            }}
          />

          <div className="relative flex min-h-48 items-start">
            <div className="z-10 w-20 shrink-0 pt-2 text-center font-athletic">
              <div className="text-5xl font-black leading-none">{entry.points}</div>
              <div className="mt-1 text-sm font-black tracking-widest">PTS</div>
              <div className="mx-auto my-3 h-px w-10 bg-current opacity-30" />
              <div className="text-xl font-black">{PROFILE_LABELS[entry.player.player_profile || "midfield"]}</div>
              <div className="mt-2 inline-flex items-center justify-center">
                {position === 1 ? <Crown className="h-7 w-7" fill="currentColor" /> : position <= 3 ? <Medal className="h-7 w-7" fill="currentColor" /> : <Trophy className="h-7 w-7" />}
              </div>
            </div>

            <div className="relative -mr-5 ml-auto mt-1 h-48 w-48">
              <div className="absolute inset-x-2 bottom-1 h-10 rounded-full bg-black/25 blur-xl" />
              <PlayerAvatar
                name={entry.player.name}
                avatarUrl={entry.player.avatar_url}
                className="relative h-full w-full bg-transparent text-5xl font-black"
                imageClassName="object-cover object-top"
              />
            </div>
          </div>

          <div className="relative -mt-2 text-center">
            <div className="mx-auto mb-2 h-px w-4/5 bg-current opacity-30" />
            <h2 className="truncate font-athletic text-2xl font-black uppercase tracking-wide">{displayName}</h2>
            {entry.player.nickname && (
              <p className="mt-0.5 truncate text-[11px] font-bold italic opacity-80">“{entry.player.nickname}”</p>
            )}
            <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.3em] opacity-70">
              {position}º lugar · carta {theme.label}
            </p>
            <div className="mx-auto mt-2 h-px w-4/5 bg-current opacity-30" />
          </div>

          <div className="relative mt-4 grid grid-cols-2 gap-x-5 gap-y-2 font-athletic">
            {[
              [entry.goals, "GOL"],
              [entry.assists, "AST"],
              [entry.wins, "VIT"],
              [entry.games, "JOG"],
              [`${entry.winRate}%`, "APR"],
            ].map(([value, label], index) => (
              <div key={label} className={`flex items-baseline justify-center gap-2 text-xl font-black ${index === 4 ? "col-span-2" : index % 2 === 0 ? "border-r border-current/20" : ""}`}>
                <span>{value}</span>
                <span className="text-sm tracking-wider opacity-75">{label}</span>
              </div>
            ))}
          </div>

          <div className="relative mt-5">
            <PlayerAwards seasons={awardSeasons} context="card" />
          </div>
          {entry.fitness && (
            <div className="relative mt-3 grid grid-cols-2 gap-2 rounded-xl border border-current/20 bg-white/10 p-2 text-center">
              <div><p className="text-lg font-black">{entry.fitness.distanceKm} km</p><p className="text-[8px] font-black uppercase opacity-70">Distância Ranked</p></div>
              <div><p className="text-lg font-black">{entry.fitness.averageSpeedKmh} km/h</p><p className="text-[8px] font-black uppercase opacity-70">Velocidade média</p></div>
            </div>
          )}
        </div>

        <Link
          href={`/jogadores/${entry.player.id}`}
          className="mx-auto mt-5 flex w-[88%] items-center justify-center rounded-xl bg-accent py-3.5 text-sm font-black uppercase tracking-wide text-background shadow-lg shadow-accent/15"
        >
          Abrir perfil completo
        </Link>
      </div>
    </div>
  );
}
