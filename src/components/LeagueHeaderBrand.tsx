import Image from "next/image";
import Link from "next/link";
import { getSelectedLeague } from "@/lib/league-context";

export async function LeagueHeaderBrand() {
  const league = await getSelectedLeague();
  return <Link href="/lobby" className="group flex min-w-0 flex-1 items-center gap-2.5 pr-1" aria-label="Abrir lobby e trocar de pelada">
    <div className="relative size-10 shrink-0 overflow-hidden rounded-xl bg-[#020b07] shadow-[0_0_20px_rgba(204,255,0,.08)] transition-transform group-hover:scale-[1.03]">
      <Image src="/brand-logo.png" alt="" width={203} height={255} priority className="absolute -left-[6px] -top-[9px] h-[62px] w-[50px] max-w-none" />
    </div>
    <span className="min-w-0 flex-1">
      <span className="line-clamp-2 break-words text-balance font-club text-lg uppercase leading-[0.95] text-accent sm:line-clamp-1">
        {league?.name || "Pelada BQ"}
      </span>
      <span className="mt-1 block text-[10px] font-normal uppercase leading-none text-muted">Toque para trocar</span>
    </span>
  </Link>;
}
