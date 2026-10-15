import Link from "next/link";

export default function StadiumEntryPage() {
  return <div className="flex min-h-dvh flex-col bg-[#031008] text-white">
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
      <Link href="/inicio" className="font-athletic text-xl font-black uppercase italic text-[#ccff00]">Pelada BQ</Link>
      <Link href="/login?next=/lobby" className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold">Login de jogador</Link>
    </header>
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-5 py-16 sm:px-8">
      <div className="max-w-2xl">
        <p className="text-xs font-black uppercase tracking-[.2em] text-[#ccff00]">Área de estádios · em preparação</p>
        <h1 className="mt-4 font-athletic text-5xl font-black uppercase italic leading-none sm:text-7xl">O seu campo também entra em jogo.</h1>
        <p className="mt-6 text-base leading-7 text-white/70">Estamos preparando uma área separada para campos de futebol gerenciarem agenda, horários e peladas. O acesso de estádio ainda não está disponível e não usa a conta de jogador.</p>
        <div className="mt-8 rounded-2xl border border-[#ccff00]/25 bg-[#ccff00]/5 p-5 text-sm text-white/75">Estrutura reservada para o futuro produto de estádios. Nenhuma reserva ou cobrança é feita por esta página.</div>
        <Link href="/inicio" className="mt-8 inline-block rounded-xl bg-[#ccff00] px-6 py-3 text-sm font-black text-[#071006]">Voltar ao início</Link>
      </div>
    </main>
  </div>;
}
