"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Share2 } from "@/components/icons";

export function ShareAppButton({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const shareUrl = typeof window !== "undefined" ? window.location.origin : "";
    const shareData = {
      title: "Liga da Pelada",
      text: "⚽ Acompanhe os jogos, confirme presença na convocação e escale seu time no Cartola da Liga da Pelada!",
      url: shareUrl,
    };

    if (typeof navigator !== "undefined" && navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (err.name === "AbortError") return;
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${shareData.text}\n👉 ${shareUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Erro ao copiar link:", err);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-accent/40 bg-accent/15 text-accent shadow-[0_0_15px_rgba(204,255,0,0.12)] transition-all duration-200 hover:border-accent hover:bg-accent/25 hover:scale-105 active:scale-95 ${className}`}
      title="Compartilhar aplicativo"
      aria-label="Compartilhar app"
    >
      {copied ? (
        <CheckCircle2 className="h-5 w-5 text-accent animate-scale-in" />
      ) : (
        <Share2 className="h-5 w-5 text-accent" />
      )}
      {copied && (
        <span className="pointer-events-none absolute -bottom-7 right-0 whitespace-nowrap rounded-lg bg-surface border border-accent/40 px-2 py-0.5 text-[9px] font-black uppercase text-accent shadow-lg animate-fade-in">
          Link copiado!
        </span>
      )}
    </button>
  );
}
