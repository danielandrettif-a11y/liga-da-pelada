import Link from "next/link";
import { ChevronRight, Crown, Sparkles } from "@/components/icons";
import type { SeasonPassDashboard } from "@/lib/actions/fantasy";

type Props = {
  pass?: SeasonPassDashboard;
  compact?: boolean;
};

export function SeasonPassBanner({ pass, compact = false }: Props) {
  const progress = pass?.progress ?? 0;
  const maxProgress = pass?.maxProgress ?? 40;

  return (
    <Link href="/cartola/passe" className={`group relative flex items-center gap-3 overflow-hidden border border-[#9f5cff]/45 bg-gradient-to-r from-[#180b2b] via-[#2b1050] to-[#101c35] shadow-[0_0_24px_rgba(126,63,255,0.13)] ${compact ? "mb-4 rounded-2xl p-3" : "rounded-[1.7rem] p-4"}`}>
      <span className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#a04dff]/20 blur-3xl" />
      <span className={`relative flex shrink-0 items-center justify-center rounded-2xl border border-[#bd82ff]/35 bg-[#8d3cff]/20 text-[#c899ff] ${compact ? "h-12 w-12" : "h-14 w-14"}`}><Crown className={compact ? "h-6 w-6" : "h-7 w-7"} /><Sparkles className="absolute -right-1 -top-1 h-3.5 w-3.5 text-[#ffd34d]" /></span>
      <span className="relative min-w-0 flex-1"><span className="block font-athletic text-[10px] font-black uppercase italic tracking-[0.18em] text-[#c899ff]">Universo Cartola</span><span className={`block truncate font-black text-white ${compact ? "text-sm" : "text-base"}`}>Passe de Temporada BQ</span><span className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-white/65"><span>Casa {progress}/{maxProgress}</span><span className="h-1.5 min-w-12 max-w-24 flex-1 overflow-hidden rounded-full bg-white/15"><span className="block h-full rounded-full bg-[#d7adff]" style={{ width: `${Math.min(100, (progress / maxProgress) * 100)}%` }} /></span></span></span>
      <span className="relative flex shrink-0 items-center gap-1 text-[10px] font-black uppercase text-[#d7adff]">{compact ? "Ver" : "Abrir trilha"}<ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
    </Link>
  );
}
