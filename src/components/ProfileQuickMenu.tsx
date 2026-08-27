"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlayerAvatar } from "./PlayerAvatar";
import { Loader2, Sliders, Sparkles, UserRound, X } from "./icons";
import { getPlayerRankingEntry } from "@/lib/actions/stats";
import type { RankingEntry } from "@/lib/ranking";

const RankingPlayerCardModal = dynamic(
  () => import("./RankingPlayerCardModal").then((module) => module.RankingPlayerCardModal),
  { ssr: false },
);

type ProfileQuickMenuProps = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  frameKey?: string | null;
  auraKey?: string | null;
};

export function ProfileQuickMenu({ playerId, name, avatarUrl, frameKey, auraKey }: ProfileQuickMenuProps) {
  const router = useRouter();
  const profileHref = `/jogadores/${playerId}`;
  const [open, setOpen] = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);
  const [navigatingProfile, setNavigatingProfile] = useState(false);
  const [rankingCard, setRankingCard] = useState<{ entry: RankingEntry; position: number } | null>(null);
  const [showRankingCard, setShowRankingCard] = useState(false);
  const openCardAfterLoadRef = useRef(false);

  useEffect(() => {
    router.prefetch(profileHref);
    router.prefetch("/meu-perfil");
  }, [profileHref, router]);

  async function loadRankingCard(openAfterLoad: boolean) {
    if (openAfterLoad) openCardAfterLoadRef.current = true;
    if (rankingCard) {
      if (openAfterLoad) {
        setOpen(false);
        setShowRankingCard(true);
      }
      return;
    }
    if (loadingCard) return;
    setLoadingCard(true);
    try {
      const cardData = await getPlayerRankingEntry(playerId);
      if (cardData) {
        setRankingCard(cardData);
        if (openCardAfterLoadRef.current) {
          setOpen(false);
          setShowRankingCard(true);
        }
      }
    } finally {
      openCardAfterLoadRef.current = false;
      setLoadingCard(false);
    }
  }

  function openMenu() {
    setOpen(true);
    router.prefetch(profileHref);
    void loadRankingCard(false);
  }

  return (
    <>
      <button type="button" onPointerDown={() => router.prefetch(profileHref)} onClick={openMenu} className="relative block rounded-full transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-accent" aria-label="Abrir opções do perfil" title={name}>
        <PlayerAvatar name={name} avatarUrl={avatarUrl} clickable={false} frameKey={frameKey} auraKey={auraKey} className="h-10 w-10 rounded-full border border-accent/30 bg-surface/90 text-xs font-black text-accent" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-end bg-black/50 p-4 pt-16 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xs rounded-3xl border border-accent/30 bg-[#07150d] p-5 shadow-[0_10px_40px_rgba(0,0,0,0.85)] animate-fade-in-up" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex min-w-0 items-center gap-3">
                <PlayerAvatar name={name} avatarUrl={avatarUrl} clickable={false} frameKey={frameKey} auraKey={auraKey} className="h-10 w-10 rounded-full bg-surface text-xs font-black text-accent" />
                <div className="min-w-0"><p className="truncate text-sm font-black text-white">{name}</p><p className="text-[10px] font-bold uppercase tracking-wider text-accent">Jogador oficial</p></div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-white" aria-label="Fechar menu"><X className="h-4 w-4" /></button>
            </div>

            <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-muted">Acesso rápido</p>
            <div className="mt-2.5 grid gap-2">
              <button type="button" disabled={loadingCard} onClick={() => void loadRankingCard(true)} className="flex items-center gap-3 rounded-2xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-left text-xs font-black text-amber-200 transition-all hover:bg-amber-400/20 active:scale-[0.98] disabled:opacity-60">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">{loadingCard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{loadingCard ? "Preparando carta..." : "Carta da temporada"}</p><p className="text-[10px] font-normal text-amber-200/70">Carta ranqueada oficial</p></div>
              </button>

              <Link href={profileHref} prefetch aria-disabled={navigatingProfile} onClick={(event) => { if (navigatingProfile) event.preventDefault(); else setNavigatingProfile(true); }} className={`flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-left text-xs font-black text-accent transition-all hover:bg-accent/20 active:scale-[0.98] ${navigatingProfile ? "pointer-events-none opacity-70" : ""}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent">{navigatingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-black">Perfil completo</p><p className="text-[10px] font-normal text-accent/70">Estatísticas e scouts no elenco</p></div>
              </Link>

              <Link href="/meu-perfil" prefetch onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-xs font-bold text-white/80 transition-all hover:bg-white/10 active:scale-[0.98]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70"><Sliders className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold">Configurações da conta</p></div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {showRankingCard && rankingCard && <RankingPlayerCardModal entry={rankingCard.entry} position={rankingCard.position} onClose={() => setShowRankingCard(false)} />}
    </>
  );
}
