"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getInitials } from "@/lib/utils";
import { useDialogViewport } from "@/lib/useDialogViewport";
import { X, ZoomIn } from "@/components/icons";
import { cosmeticAuraClass, cosmeticFrameClass } from "@/lib/fantasy/cosmetics";

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
        className={`group/avatar relative overflow-hidden flex items-center justify-center ${
          isInteractive ? "cursor-pointer active:scale-95 transition-transform" : ""
        } ${className} ${frameEffect ? `${frameEffect} ` : ""}${auraEffect ? `${auraEffect} ` : ""}`}
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
