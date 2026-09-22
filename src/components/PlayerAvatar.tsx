"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import dynamic from "next/dynamic";
import { getInitials } from "@/lib/utils";
import { useDialogViewport } from "@/lib/useDialogViewport";
import { Loader2, Sparkles, X, ZoomIn } from "@/components/icons";
import { cosmeticAuraClass, cosmeticAuraVariant, cosmeticFrameClass, cosmeticFrameImage } from "@/lib/fantasy/cosmetics";
import { getPlayerRankingEntry } from "@/lib/actions/stats";
import type { RankingEntry } from "@/lib/ranking";

const RankingPlayerCardModal = dynamic(
  () => import("./RankingPlayerCardModal").then((module) => module.RankingPlayerCardModal),
  { ssr: false },
);

type PlayerAvatarProps = {
  name: string;
  playerId?: string | null;
  avatarUrl?: string | null;
  className?: string;
  imageClassName?: string;
  clickable?: boolean;
  frameKey?: string | null;
  auraKey?: string | null;
  frameClass?: string;
  sizes?: string;
  quality?: 75 | 90;
};

export function PlayerAvatar({
  name,
  playerId,
  avatarUrl,
  className = "",
  imageClassName = "",
  clickable = true,
  frameKey,
  auraKey,
  frameClass,
  sizes = "(max-width: 640px) 80px, 96px",
  quality = 75,
}: PlayerAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);
  const [rankingCard, setRankingCard] = useState<{ entry: RankingEntry; position: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useDialogViewport(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const hasImage = Boolean(avatarUrl && !imageFailed);
  const isInteractive = clickable && (hasImage || Boolean(playerId));
  const frameEffect = frameClass || cosmeticFrameClass(frameKey);
  const auraEffect = cosmeticAuraClass(auraKey);
  const auraVariant = cosmeticAuraVariant(auraKey);
  const canOptimize = Boolean(avatarUrl && (
    avatarUrl.startsWith("/") || (() => {
      try {
        const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
        return Boolean(configured && new URL(avatarUrl).hostname === new URL(configured).hostname);
      } catch {
        return false;
      }
    })()
  ));

  async function openContent() {
    if (playerId) {
      if (rankingCard || loadingCard) return;
      setLoadingCard(true);
      try {
        const card = await getPlayerRankingEntry(playerId);
        if (card) setRankingCard(card);
        else if (hasImage) setIsOpen(true);
      } catch {
        if (hasImage) setIsOpen(true);
      } finally {
        setLoadingCard(false);
      }
      return;
    }
    if (hasImage) setIsOpen(true);
  }

  function handleClick(e: React.MouseEvent) {
    if (!isInteractive) return;
    e.stopPropagation();
    e.preventDefault();
    void openContent();
  }

  return (
    <>
      <div
        onClick={handleClick}
        className={`group/avatar relative flex items-center justify-center shrink-0 ${
          isInteractive ? "cursor-pointer active:scale-95 transition-transform" : ""
        } ${className} ${auraEffect ? `${auraEffect} ` : ""}`}
        style={auraEffect ? { overflow: "visible" } : undefined}
        aria-label={playerId ? `Abrir carta de ${name}` : `Foto de ${name}`}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onKeyDown={(e) => {
          if (isInteractive && (e.key === "Enter" || e.key === " ")) {
            e.stopPropagation();
            e.preventDefault();
            void openContent();
          }
        }}
      >
        <CosmeticAuraOverlay variant={auraVariant} />

        {/* Foto com overflow-hidden para recorte circular */}
        <div className={`player-avatar__photo relative z-10 flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit] ${frameEffect ? `${frameEffect} ` : ""}`}>
          {hasImage && canOptimize ? (
            <Image
              src={avatarUrl!}
              alt={`Foto de ${name}`}
              fill
              sizes={sizes}
              quality={quality}
              className={`player-avatar__image object-cover ${imageClassName}`}
              onError={() => setImageFailed(true)}
            />
          ) : hasImage ? (
            <img
              src={avatarUrl!}
              alt={`Foto de ${name}`}
              className={`player-avatar__image h-full w-full object-cover ${imageClassName}`}
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span aria-hidden="true">{getInitials(name)}</span>
          )}

          {auraVariant && (
            <span aria-hidden="true" className={`cosmetic-aura-inside cosmetic-aura-inside--${auraVariant}`}>
              <span className="cosmetic-aura-inside__detail" />
            </span>
          )}

          {isInteractive && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover/avatar:opacity-100">
              {loadingCard ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent drop-shadow" />
              ) : playerId ? (
                <Sparkles className="h-3.5 w-3.5 text-accent drop-shadow" />
              ) : (
                <ZoomIn className="h-3.5 w-3.5 text-accent drop-shadow" />
              )}
            </span>
          )}
        </div>

        {/* Moldura sobreposta fora do overflow-hidden */}
        <CosmeticFrameOverlay assetKey={frameKey} />
      </div>

      {isOpen &&
        mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="mobile-dialog-backdrop z-[99999] bg-black/90 backdrop-blur-md animate-fade-in"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-label={`Foto ampliada de ${name}`}
          >
            <div
              className="relative flex max-h-[85vh] w-full max-w-sm flex-col items-center overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] p-6 shadow-[0_0_60px_rgba(0,0,0,0.95)] animate-fade-in-up my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Botão Fechar */}
              <button
                onClick={() => setIsOpen(false)}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Fechar foto"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Imagem Ampliada */}
              <div className="relative mt-2 aspect-square w-64 max-w-full overflow-hidden rounded-2xl border-2 border-accent shadow-[0_0_30px_rgba(204,255,0,0.25)]">
                {canOptimize ? (
                  <Image src={avatarUrl!} alt={`Foto de ${name}`} fill sizes="256px" quality={90} className="object-cover" />
                ) : (
                  <img src={avatarUrl!} alt={`Foto de ${name}`} className="h-full w-full object-cover" decoding="async" />
                )}
              </div>

              {/* Informações do Jogador */}
              <div className="mt-5 text-center">
                <h3 className="font-athletic text-2xl font-black uppercase italic tracking-wide text-foreground">
                  {name}
                </h3>
                <p className="mt-1 text-xs font-semibold text-accent">Jogador da Liga da Pelada</p>
              </div>
            </div>
          </div>,
          document.body
        )}

      {rankingCard && (
        <RankingPlayerCardModal
          entry={rankingCard.entry}
          position={rankingCard.position}
          onClose={() => setRankingCard(null)}
        />
      )}
    </>
  );
}

function CosmeticFrameOverlay({ assetKey }: { assetKey?: string | null }) {
  if (!assetKey) return null;
  const key = assetKey.toLowerCase();
  const image = cosmeticFrameImage(assetKey);
  if (image) {
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[28%] z-20 bg-contain bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${image})`,
          filter: "brightness(1.12) contrast(1.18) saturate(1.2) drop-shadow(0 2px 3px rgba(0,0,0,.82)) drop-shadow(0 0 4px rgba(218,181,76,.34))",
        }}
      />
    );
  }
  if (key.includes("alambrado") || key.includes("rede")) {
    const stroke = key.includes("rede") ? "rgba(186,230,253,.78)" : "rgba(228,228,231,.68)";
    return (
      <svg aria-hidden="true" className="pointer-events-none absolute -inset-[8%] z-20 h-[116%] w-[116%] rounded-[inherit]" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs><pattern id={`mesh-${key}`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M 0 0 L 0 14 M 7 0 L 7 14" stroke={stroke} strokeWidth="1.25" /></pattern></defs>
        <rect x="1.5" y="1.5" width="97" height="97" rx="48" fill="none" stroke={stroke} strokeWidth="3" />
        <rect x="1.5" y="1.5" width="97" height="97" rx="48" fill={`url(#mesh-${key})`} opacity=".24" />
      </svg>
    );
  }
  if (key.includes("capitao") || key.includes("faixa")) {
    return <span aria-hidden="true" className="pointer-events-none absolute inset-x-[-12%] bottom-[6%] z-20 -rotate-12 border-y border-amber-200/80 bg-gradient-to-r from-amber-950 via-amber-400 to-amber-950 py-[6%] opacity-90 shadow-lg" />;
  }
  if (key.includes("neon")) {
    return <span aria-hidden="true" className="pointer-events-none absolute -inset-[6%] z-20 rounded-[inherit] border-2 border-[#dcff65] shadow-[inset_0_0_10px_rgba(204,255,0,.65),0_0_14px_rgba(204,255,0,.85)]" />;
  }
  return null;
}

function CosmeticAuraOverlay({ variant }: { variant: ReturnType<typeof cosmeticAuraVariant> }) {
  if (!variant) return null;

  return (
    <span aria-hidden="true" className={`cosmetic-aura cosmetic-aura--${variant}`}>
      <span className="cosmetic-aura__detail" />
    </span>
  );
}
