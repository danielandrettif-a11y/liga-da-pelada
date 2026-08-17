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
      className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/15 via-surface to-background px-4 py-2.5 text-xs font-black uppercase tracking-wider text-accent transition-all duration-200 hover:border-accent hover:bg-accent/20 active:scale-[0.98] ${className}`}
      title="Compartilhar aplicativo com amigos"
      aria-label="Compartilhar app"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-4 w-4 text-accent animate-scale-in" />
          <span>Link copiado!</span>
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4 text-accent" />
          <span>Compartilhar App</span>
        </>
      )}
    </button>
  );
}
