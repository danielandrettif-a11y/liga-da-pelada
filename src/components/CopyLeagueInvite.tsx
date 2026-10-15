"use client";

import { useState } from "react";

export function CopyLeagueInvite({ token, name }: { token: string; name: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const link = `${window.location.origin}/convite/${token}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }
  return <button type="button" onClick={copy} className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-black text-accent" aria-label={`Copiar convite para ${name}`}>{copied ? "Link copiado!" : "Copiar link de convite"}</button>;
}
