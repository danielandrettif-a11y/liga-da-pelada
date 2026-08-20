import Link from "next/link";
import { ChevronRight, Crown, Sparkles } from "@/components/icons";

export function SeasonPassBanner() {
  return (
    <Link href="/cartola/passe" className="group mb-4 flex items-center gap-3 overflow-hidden rounded-2xl border border-[#9f5cff]/45 bg-gradient-to-r from-[#180b2b] via-[#2b1050] to-[#101c35] p-3 shadow-[0_0_24px_rgba(126,63,255,0.13)]">
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#bd82ff]/35 bg-[#8d3cff]/20 text-[#c899ff]"><Crown className="h-6 w-6" /><Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-[#ffd34d]" /></span>
      <span className="min-w-0 flex-1"><span className="block font-athletic text-[10px] font-black uppercase italic tracking-[0.18em] text-[#c899ff]">Universo Cartola</span><span className="block truncate text-sm font-black text-white">Passe de Temporada BQ</span><span className="block truncate text-[10px] text-white/55">Pacotes, cartas e recompensas da temporada</span></span>
      <span className="flex items-center gap-1 text-[10px] font-black uppercase text-[#d7adff]">Conhecer <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
    </Link>
  );
}
