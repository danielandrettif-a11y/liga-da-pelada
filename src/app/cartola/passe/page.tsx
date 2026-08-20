import Link from "next/link";
import { ArrowLeft, Crown, Sparkles, Trophy } from "@/components/icons";

const steps = [
  ["Jogue o Cartola", "Monte sua escalação nas pré-listas Ranked e acompanhe a pontuação."],
  ["Ganhe pacotes", "Cada rodada oficial pode liberar novas escolhas de cartas para o inventário."],
  ["Use uma carta", "Ative uma carta antes do mercado fechar e tente cumprir o desafio dela."],
];

export default function SeasonPassPage() {
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3"><Link href="/cartola" aria-label="Voltar ao Cartola" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface"><ArrowLeft className="h-5 w-5 text-muted" /></Link><div><p className="font-athletic text-[10px] font-black uppercase italic tracking-[0.2em] text-[#bd82ff]">Temporada BQ</p><h1 className="text-xl font-black text-foreground">Passe de Temporada</h1></div></header>

      <section className="relative overflow-hidden rounded-[2rem] border border-[#a65cff]/45 bg-gradient-to-br from-[#321064] via-[#160c2c] to-[#07170e] p-6 shadow-[0_0_35px_rgba(142,65,255,0.18)]">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#a04dff]/20 blur-3xl" />
        <Crown className="h-10 w-10 text-[#d2a2ff]" /><p className="mt-4 font-athletic text-xs font-black uppercase italic tracking-[0.22em] text-[#bd82ff]">Passe BQ · Beta</p><h2 className="mt-1 max-w-xs font-athletic text-3xl font-black uppercase italic leading-none text-white">Sua temporada dentro do Cartola</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/65">Colecione cartas de diferentes raridades, cumpra desafios e construa seu histórico no fantasy da pelada.</p>
      </section>

      <section className="space-y-2">{steps.map(([title, description], index) => <article key={title} className="flex gap-3 rounded-2xl border border-border bg-surface p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8e45ff]/15 font-athletic text-lg font-black text-[#c99aff]">{index + 1}</span><div><h3 className="text-sm font-black text-foreground">{title}</h3><p className="mt-1 text-xs leading-5 text-muted">{description}</p></div></article>)}</section>

      <div className="rounded-2xl border border-warning/25 bg-warning/10 p-4 text-center"><Sparkles className="mx-auto h-5 w-5 text-warning" /><p className="mt-2 text-sm font-black text-foreground">Trilha de recompensas em desenvolvimento</p><p className="mt-1 text-xs text-muted">Os pacotes e o inventário já funcionam. Novos níveis e recompensas chegarão nas próximas versões.</p></div>
      <Link href="/cartola" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-black uppercase text-background"><Trophy className="h-5 w-5" /> Voltar ao Cartola</Link>
    </div>
  );
}
