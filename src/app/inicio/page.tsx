import Link from "next/link";

const benefits = [
  { number: "01", title: "Sua pelada, organizada", description: "Convocações, rodada, times e resultados em um só lugar — sem perder a resenha do grupo." },
  { number: "02", title: "Ranking que acompanha o jogo", description: "Gols, assistências e scouts registrados viram histórico e classificação da sua pelada." },
  { number: "03", title: "Do básico ao completo", description: "Comece com a organização e o ranking. Na versão completa, adicione Cartola e outras experiências." },
];

export default function PublicHomePage() {
  return <div className="min-h-dvh bg-[#031008] text-white">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
      <Link href="/inicio" className="font-athletic text-xl font-black uppercase italic tracking-wide text-[#ccff00]">Pelada BQ</Link>
      <nav aria-label="Acessos" className="flex items-center gap-2 text-xs font-bold sm:text-sm">
        <Link href="/login?next=/lobby" className="rounded-full border border-[#ccff00]/50 px-3 py-2 text-[#ccff00] hover:bg-[#ccff00]/10 sm:px-5">Login de jogador</Link>
        <Link href="/estadio" className="rounded-full border border-white/20 px-3 py-2 text-white/80 hover:border-white/50 sm:px-5">Login de estádio</Link>
      </nav>
    </header>

    <main>
      <section className="relative overflow-hidden border-y border-[#ccff00]/10 bg-[radial-gradient(circle_at_80%_10%,rgba(204,255,0,.16),transparent_40%),linear-gradient(140deg,#071d10,#031008_62%)]">
        <div className="pointer-events-none absolute -right-28 top-20 h-80 w-80 rounded-full border border-[#ccff00]/10 sm:h-[30rem] sm:w-[30rem]" />
        <div className="pointer-events-none absolute -right-10 top-32 h-64 w-64 rounded-full border border-[#ccff00]/10 sm:h-[25rem] sm:w-[25rem]" />
        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
          <p className="mb-5 inline-flex rounded-full border border-[#ccff00]/30 bg-[#ccff00]/10 px-4 py-2 text-xs font-black uppercase tracking-[.18em] text-[#ccff00]">Seu futebol tem história</p>
          <h1 className="max-w-3xl font-athletic text-5xl font-black uppercase italic leading-[.95] tracking-tight sm:text-7xl lg:text-8xl">Toda pelada merece <span className="text-[#ccff00]">ser lembrada.</span></h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-white/70 sm:text-lg">Crie seu perfil, participe das peladas dos seus amigos e acompanhe cada rodada. Sua turma escolhe como jogar; o app Pelada BQ cuida da organização.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/cadastro?next=/lobby" className="rounded-xl bg-[#ccff00] px-6 py-4 text-sm font-black text-[#071006] hover:bg-[#dfff59]">Criar conta de jogador →</Link>
            <Link href="/login?next=/lobby" className="rounded-xl border border-white/25 px-6 py-4 text-sm font-black text-white hover:bg-white/10">Já tenho conta</Link>
          </div>
          <p className="mt-5 text-xs text-white/45">Cadastro com Google ou e-mail e senha. Você escolhe sua pelada depois de entrar.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24" id="como-funciona">
        <div className="max-w-xl">
          <p className="text-xs font-black uppercase tracking-[.2em] text-[#ccff00]">Como funciona</p>
          <h2 className="mt-3 font-athletic text-4xl font-black uppercase italic sm:text-5xl">Um lugar para todas as suas peladas.</h2>
          <p className="mt-4 text-sm leading-6 text-white/60">Depois do cadastro, seu lobby reúne as peladas de que você participa. Favoritas ficam no topo. Você pode entrar por convite privado ou descobrir peladas abertas.</p>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {benefits.map((benefit) => <article key={benefit.number} className="rounded-3xl border border-white/10 bg-white/[.035] p-6">
            <span className="font-athletic text-3xl font-black text-[#ccff00]">{benefit.number}</span>
            <h3 className="mt-5 text-lg font-black">{benefit.title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/60">{benefit.description}</p>
          </article>)}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#081a0d]">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 md:grid-cols-2 md:py-20">
          <div><p className="text-xs font-black uppercase tracking-[.2em] text-[#ccff00]">Para jogadores</p><h2 className="mt-3 font-athletic text-3xl font-black uppercase italic">Entre, descubra, jogue.</h2><p className="mt-3 text-sm leading-6 text-white/65">Encontre sua pelada no lobby, acompanhe sua evolução e veja as próximas partidas. Peladas privadas, como a BQ, exigem convite ou aprovação.</p><Link href="/cadastro?next=/lobby" className="mt-5 inline-block text-sm font-black text-[#ccff00]">Quero participar →</Link></div>
          <div><p className="text-xs font-black uppercase tracking-[.2em] text-[#ccff00]">Para administradores</p><h2 className="mt-3 font-athletic text-3xl font-black uppercase italic">Comece simples. Cresça quando quiser.</h2><p className="mt-3 text-sm leading-6 text-white/65">A pelada Básica terá ranking e rodadas. A Completa reunirá Cartola, cosméticos e mais recursos. A criação de novas peladas será liberada após a validação do isolamento dos dados.</p><Link href="/login?next=/lobby" className="mt-5 inline-block text-sm font-black text-[#ccff00]">Acessar meu lobby →</Link></div>
        </div>
      </section>
    </main>

    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-white/45 sm:px-8"><span>Pelada BQ · futebol com história</span><Link href="/estadio" className="hover:text-white">Área de estádio (em preparação)</Link></footer>
  </div>;
}
