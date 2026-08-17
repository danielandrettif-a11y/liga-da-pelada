"use client";

import { useEffect, useState } from "react";
import { getInitials } from "@/lib/utils";
import { useDialogViewport } from "@/lib/useDialogViewport";
import { X, ZoomIn } from "@/components/icons";

type PlayerAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  imageClassName?: string;
  clickable?: boolean;
};

export function PlayerAvatar({
  name,
  avatarUrl,
  className = "",
  imageClassName = "",
  clickable = true,
}: PlayerAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  useDialogViewport(isOpen);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const hasImage = Boolean(avatarUrl && !imageFailed);
  const isInteractive = clickable && hasImage;

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
        } ${className}`}
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

      {isOpen && (
        <div
          className="mobile-dialog-backdrop fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-sm flex-col items-center overflow-hidden rounded-3xl border border-accent/40 bg-[#07150d] p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Foto ampliada de ${name}`}
          >
            {/* Botão Fechar */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              aria-label="Fechar foto"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Imagem Ampliada */}
            <div className="relative mt-2 aspect-square w-64 max-w-full overflow-hidden rounded-2xl border-2 border-accent shadow-[0_0_30px_rgba(204,255,0,0.2)]">
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
        </div>
      )}
    </>
  );
}
