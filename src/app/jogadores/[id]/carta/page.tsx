import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getPlayer } from "@/lib/actions/players";
import { getPlayerEquippedCosmetics } from "@/lib/actions/cosmetics";
import { cosmeticNameplateClass, cosmeticVisual } from "@/lib/fantasy/cosmetics";

export default async function PlayerCardPage({ params }: PageProps<"/jogadores/[id]/carta">) {
  const { id } = await params;
  const [player, cosmetics] = await Promise.all([getPlayer(id), getPlayerEquippedCosmetics(id)]);
  if (!player) notFound();
  return <main className="mx-auto max-w-md space-y-4"><Link href={`/jogadores/${id}`} className="text-xs font-black text-accent">← Perfil completo</Link><section className={`relative overflow-hidden rounded-[2rem] border border-accent/35 bg-gradient-to-br ${cosmeticVisual(cosmetics?.bannerAssetKey || cosmetics?.backgroundAssetKey)} p-6 text-center shadow-2xl`}><div className="absolute inset-0 bg-black/35" /><div className="relative"><p className="text-[10px] font-black uppercase tracking-[.22em] text-accent">Carta oficial BQ</p><PlayerAvatar name={player.name} avatarUrl={player.avatar_url} clickable={false} frameKey={cosmetics?.frameKey} auraKey={cosmetics?.auraKey} className="mx-auto mt-5 h-28 w-28 rounded-full bg-black/50 text-2xl font-black text-white" /><div className={`mx-auto mt-5 inline-block rounded-xl border px-4 py-2 ${cosmeticNameplateClass(cosmetics?.nameplateKey)}`}><h1 className="font-athletic text-2xl font-black uppercase italic">{player.name}</h1>{cosmetics?.titleName && <p className="mt-1 text-[10px] font-black uppercase tracking-[.16em]">✦ {cosmetics.titleName}</p>}</div><p className="mt-6 rounded-2xl bg-black/35 p-3 text-[10px] font-black uppercase tracking-[.16em] text-white/70">Perfil oficial da Pelada de Baixa Qualidade</p></div></section></main>;
}
