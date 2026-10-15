import Image from "next/image";
import Link from "next/link";
import { getSelectedLeague } from "@/lib/league-context";

export async function LeagueHeaderBrand() {
  const league = await getSelectedLeague();
  return <Link href="/lobby" className="group flex min-w-0 items-center gap-2.5" aria-label="Abrir lobby e trocar de pelada">
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-[#020b07] shadow-[0_0_20px_rgba(204,255,0,.08)] transition-transform group-hover:scale-[1.03]">
      <Image src="/brand-logo.png" alt="" width={203} height={255} priority className="absolute -left-[6px] -top-[9px] h-[62px] w-[50px] max-w-none" />
    </div>
    <span className="min-w-0 truncate font-athletic text-sm font-black uppercase italic text-accent">
      {league?.name || "Pelada BQ"}
      <span className="block text-[10px] font-normal not-italic text-muted">Toque para trocar</span>
    </span>
  </Link>;
}
