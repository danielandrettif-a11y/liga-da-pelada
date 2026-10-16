"use client";

import { useState } from "react";
import { Copy } from "@/components/icons";

export function CopyLeagueInvite({ token, name, fullWidth = false }: { token: string; name: string; fullWidth?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function copy() {
    try {
      const link = `${window.location.origin}/convite/${token}`;
      await navigator.clipboard.writeText(link);
      setError(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
      setError(true);
    }
  }
  return <div>
    <button
      type="button"
      onClick={copy}
      className={`${fullWidth ? "w-full py-3" : "px-4 py-2"} flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 text-xs font-black text-accent`}
      aria-label={`Copiar convite para ${name}`}
    >
      <Copy className="size-4" />
      {copied ? "Link copiado!" : "Copiar link de convite"}
    </button>
    {error && <p role="alert" className="mt-2 text-xs font-bold text-danger">Não foi possível copiar. Verifique a permissão do navegador.</p>}
  </div>;
}
