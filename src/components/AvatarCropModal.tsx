"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { Check, Minus, Plus, X } from "@/components/icons";
import { createCroppedAvatar } from "@/lib/cropImage";

type AvatarCropModalProps = {
  imageUrl: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

export function AvatarCropModal({ imageUrl, onCancel, onConfirm }: AvatarCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!croppedArea) return;

    setProcessing(true);
    setError("");
    try {
      const croppedFile = await createCroppedAvatar(imageUrl, croppedArea);
      onConfirm(croppedFile);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Erro ao recortar a foto.");
      setProcessing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-stretch justify-center bg-background/95 backdrop-blur-md sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crop-avatar-title"
    >
      <div className="flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background shadow-2xl animate-slide-in-bottom sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:border sm:border-border">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-50"
            aria-label="Cancelar recorte"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h2 id="crop-avatar-title" className="text-sm font-bold text-foreground">Ajustar foto</h2>
            <p className="text-[10px] text-muted">Arraste para posicionar</p>
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={processing || !croppedArea}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-background disabled:opacity-40 sm:hidden"
            aria-label="Usar foto"
          >
            <Check className="h-5 w-5" />
          </button>
          <div className="hidden w-10 sm:block" />
        </div>

        <div className="relative min-h-0 flex-1 bg-black sm:h-[min(55vh,430px)] sm:flex-none">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            minZoom={1}
            maxZoom={4}
            zoomSpeed={0.25}
            roundCropAreaPixels
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
            mediaProps={{ alt: "Foto escolhida para recorte" }}
          />
        </div>

        <div className="shrink-0 space-y-3 bg-surface p-4 sm:space-y-5 sm:p-5">
          <div className="flex items-center gap-3">
            <Minus className="w-4 h-4 text-muted flex-shrink-0" />
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-[var(--accent)]"
              aria-label="Zoom da foto"
            />
            <Plus className="w-4 h-4 text-muted flex-shrink-0" />
          </div>

          <p className="text-[11px] text-muted text-center">
            Use dois dedos para ampliar ou arraste a foto dentro do círculo.
          </p>

          {error && (
            <div role="alert" className="p-3 rounded-lg bg-danger/10 text-danger text-xs font-semibold text-center">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pb-[max(0px,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onCancel}
              disabled={processing}
              className="py-3.5 rounded-xl bg-surface-hover border border-border text-foreground font-bold text-sm disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={processing || !croppedArea}
              className="py-3.5 rounded-xl bg-accent hover:bg-accent-light text-background font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {processing ? "Preparando..." : "Usar foto"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
