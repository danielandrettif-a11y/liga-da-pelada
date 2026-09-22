"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function OfficialProfilePreviewNotice({ playerId }: { playerId: string }) {
  const searchParams = useSearchParams();
  const returnParams = new URLSearchParams({ mode: "preview" });
  for (const slot of ["banner", "frame", "title", "aura", "nameplate", "background", "showcase", "pitch"]) {
    const value = searchParams.get(slot);
    if (value) returnParams.set(slot, value);
  }
  return (
    <section className="rounded-2xl border border-amber-300/45 bg-amber-300/10 p-3 shadow-[0_0_22px_rgba(251,191,36,.1)]">
      <p className="text-[10px] font-black uppercase tracking-[.14em] text-amber-200">Prévia administrativa</p>
      <p className="mt-1 text-[11px] leading-4 text-amber-50/85">Você está vendo a página oficial do Elenco com itens temporários. Nada foi equipado ou salvo.</p>
      <div className="mt-3 flex gap-2">
        <Link href={`/meu-perfil?${returnParams.toString()}#colecao`} className="rounded-lg border border-amber-200/35 bg-black/20 px-3 py-2 text-[9px] font-black uppercase text-amber-100">Voltar ao provador</Link>
        <Link href={`/jogadores/${playerId}`} className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[9px] font-black uppercase text-white/80">Sair da prévia</Link>
      </div>
    </section>
  );
}
