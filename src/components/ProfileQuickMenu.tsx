"use client";

import Link from "next/link";
import { useState } from "react";
import { PlayerAvatar } from "./PlayerAvatar";
import { X } from "./icons";

export function ProfileQuickMenu({ playerId, name, avatarUrl, frameKey, auraKey }: { playerId: string; name: string; avatarUrl: string | null; frameKey?: string | null; auraKey?: string | null }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)} className="relative block rounded-full transition-transform active:scale-95" aria-label="Abrir opções do perfil" title={name}><PlayerAvatar name={name} avatarUrl={avatarUrl} clickable={false} frameKey={frameKey} auraKey={auraKey} className="h-10 w-10 rounded-full border border-accent/30 bg-surface/90 text-xs font-black text-accent" /></button>{open && <div className="fixed inset-0 z-[100] flex items-start justify-end bg-black/45 p-4 pt-16 backdrop-blur-sm" onClick={() => setOpen(false)}><div className="w-full max-w-xs rounded-3xl border border-accent/30 bg-[#07150d] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><p className="text-sm font-black text-white">{name}</p><button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted"><X className="h-4 w-4" /></button></div><p className="mt-1 text-[11px] text-muted">Para onde você quer ir?</p><div className="mt-4 grid gap-2"><Link href={`/jogadores/${playerId}/carta`} onClick={() => setOpen(false)} className="rounded-2xl border border-amber-300/35 bg-amber-300/10 px-4 py-3 text-xs font-black text-amber-100">🃏 Carta do jogador</Link><Link href="/meu-perfil" onClick={() => setOpen(false)} className="rounded-2xl border border-accent/35 bg-accent/10 px-4 py-3 text-xs font-black text-accent">👤 Perfil completo</Link></div></div></div>}</>;
}
