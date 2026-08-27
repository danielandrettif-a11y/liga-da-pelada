"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getInitials } from "@/lib/utils";
import { useDialogViewport } from "@/lib/useDialogViewport";
import { X, ZoomIn } from "@/components/icons";
import { cosmeticAuraClass, cosmeticFrameClass, cosmeticFrameImage } from "@/lib/fantasy/cosmetics";

type PlayerAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  imageClassName?: string;
  clickable?: boolean;
  frameKey?: string | null;
  auraKey?: string | null;
  frameClass?: string;
};

export function PlayerAvatar({
  name,
  avatarUrl,
  className = "",
  imageClassName = "",
  clickable = true,
  frameKey,
  auraKey,
  frameClass,
}: PlayerAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useDialogViewport(isOpen);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const hasImage = Boolean(avatarUrl && !imageFailed);
  const isInteractive = clickable && hasImage;
  const frameEffect = frameClass || cosmeticFrameClass(frameKey);
  const auraEffect = cosmeticAuraClass(auraKey);

  function handleClick(e: React.MouseEvent) {
    if (!isInteractive) return;
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(true);
  }

  return (
    <>
      <div
        onClick={handleClick}
        className={`group/avatar relative flex items-center justify-center shrink-0 ${
          isInteractive ? "cursor-pointer active:scale-95 transition-transform" : ""
        } ${className} ${auraEffect ? `${auraEffect} ` : ""}`}
        aria-label={`Foto de ${name}`}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onKeyDown={(e) => {
          if (isInteractive && (e.key === "Enter" || e.key === " ")) {
            e.stopPropagation();
            e.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        {/* Foto com overflow-hidden para recorte circular */}
        <div className={`relative h-full w-full overflow-hidden rounded-[inherit] flex items-center justify-center ${frameEffect ? `${frameEffect} ` : ""}`}>
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl!}
              alt={`Foto de ${name}`}
              className={`h-full w-full object-cover ${imageClassName}`}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span aria-hidden="true">{getInitials(name)}</span>
          )}

          {isInteractive && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover/avatar:opacity-100">
              <ZoomIn className="h-3.5 w-3.5 text-accent drop-shadow" />
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl!}
                  alt={`Foto de ${name}`}
                  className="h-full w-full object-cover"
                />
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
        className="pointer-events-none absolute -inset-[22%] z-10 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${image})` }}
      />
    );
  }
  if (key.includes("alambrado") || key.includes("rede")) {
    const stroke = key.includes("rede") ? "rgba(186,230,253,.78)" : "rgba(228,228,231,.68)";
    return (
      <svg aria-hidden="true" className="pointer-events-none absolute -inset-[8%] z-10 h-[116%] w-[116%] rounded-[inherit]" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs><pattern id={`mesh-${key}`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M 0 0 L 0 14 M 7 0 L 7 14" stroke={stroke} strokeWidth="1.25" /></pattern></defs>
        <rect x="1.5" y="1.5" width="97" height="97" rx="48" fill="none" stroke={stroke} strokeWidth="3" />
        <rect x="1.5" y="1.5" width="97" height="97" rx="48" fill={`url(#mesh-${key})`} opacity=".24" />
      </svg>
    );
  }
  if (key.includes("capitao") || key.includes("faixa")) {
    return <span aria-hidden="true" className="pointer-events-none absolute inset-x-[-12%] bottom-[6%] z-10 -rotate-12 border-y border-amber-200/80 bg-gradient-to-r from-amber-950 via-amber-400 to-amber-950 py-[6%] opacity-90 shadow-lg" />;
  }
  if (key.includes("neon")) {
    return <span aria-hidden="true" className="pointer-events-none absolute -inset-[6%] z-10 rounded-[inherit] border-2 border-[#dcff65] shadow-[inset_0_0_10px_rgba(204,255,0,.65),0_0_14px_rgba(204,255,0,.85)]" />;
  }
  return null;
}
