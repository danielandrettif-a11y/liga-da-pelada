import Link from "next/link";
import { ChevronRight, Crown } from "@/components/icons";
import type { SeasonPassDashboard } from "@/lib/actions/fantasy";

type Props = {
  pass?: SeasonPassDashboard;
  compact?: boolean;
};

export function SeasonPassBanner({ pass, compact = false }: Props) {
  const progress = pass?.progress ?? 0;
  const maxProgress = pass?.maxProgress ?? 40;
  const progressPercentage = Math.min(100, Math.round((progress / maxProgress) * 100));

  return (
    <Link
      href="/jogadores?tab=passe"
      className={`group relative isolate block overflow-hidden border border-[#b778ff]/55 bg-[#170b2b] shadow-[0_0_28px_rgba(126,63,255,0.22)] transition-transform active:scale-[0.985] ${compact ? "min-h-[158px] rounded-3xl" : "min-h-[184px] rounded-[2rem]"}`}
    >
      <span
        className="pointer-events-none absolute inset-0 bg-cover bg-[center_right_42%] opacity-90 transition-transform duration-700 group-hover:scale-[1.035]"
        style={{ backgroundImage: "url('/images/season-pass-journey-banner.png')" }}
      />
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#170b2b_0%,#210d42_36%,rgba(31,13,63,.82)_53%,rgba(21,10,44,.08)_100%)]" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#10061e]/90 to-transparent" />
      <span className="pointer-events-none absolute -left-10 -top-12 h-36 w-36 rounded-full bg-[#b05cff]/25 blur-3xl" />

      <span className={`relative flex h-full min-h-[inherit] flex-col justify-between ${compact ? "p-4" : "p-5"}`}>
        <span className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dfb5ff]/35 bg-[#321454]/75 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.17em] text-[#e6c5ff] backdrop-blur-sm">
            <Crown className="h-3.5 w-3.5 text-[#ffd45a]" /> Passe BQ
          </span>
          <span className="rounded-xl border border-[#dfb5ff]/35 bg-[#1b0b31]/75 px-2.5 py-1 text-right backdrop-blur-sm">
            <span className="block font-athletic text-sm font-black leading-none text-white">{progress}<span className="text-[#d9a6ff]">/{maxProgress}</span></span>
            <span className="mt-0.5 block text-[7px] font-black uppercase tracking-wider text-[#d8b6f5]">casas</span>
          </span>
        </span>

        <span className="max-w-[66%]">
          <span className="block font-athletic text-[9px] font-black uppercase italic tracking-[0.22em] text-[#d9a6ff]">Da arquibancada à história</span>
          <span className={`mt-1 block font-athletic font-black uppercase italic leading-[.94] text-white drop-shadow-[0_3px_12px_rgba(0,0,0,.65)] ${compact ? "text-[26px]" : "text-3xl"}`}>Do banco à <span className="text-[#d5ff37]">lenda.</span></span>
        </span>

        <span className="flex items-end justify-between gap-3">
          <span className="min-w-0 flex-1">
            <span className="mb-1.5 flex items-center justify-between text-[8px] font-black uppercase tracking-[0.13em] text-[#d8b6f5]"><span>Sua evolução</span><span>{progressPercentage}%</span></span>
            <span className="block h-1.5 w-full overflow-hidden rounded-full border border-white/10 bg-black/35"><span className="block h-full rounded-full bg-gradient-to-r from-[#c57aff] via-[#e0b6ff] to-[#d5ff37] shadow-[0_0_12px_rgba(213,255,55,.7)]" style={{ width: `${progressPercentage}%` }} /></span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[#d5ff37] px-2.5 py-2 text-[9px] font-black uppercase tracking-wide text-[#1a092d] shadow-[0_0_18px_rgba(213,255,55,.24)]">Ver trilha <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
        </span>
      </span>
    </Link>
  );
}
