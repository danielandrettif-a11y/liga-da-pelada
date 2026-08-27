export default function PlayerCardLoading() {
  return <main className="mx-auto max-w-md space-y-4" aria-busy="true"><div className="h-4 w-28 animate-pulse rounded bg-surface" /><section className="flex min-h-96 flex-col items-center justify-center rounded-[2rem] border border-accent/20 bg-surface/70 p-6"><div className="h-28 w-28 animate-pulse rounded-full bg-accent/10" /><div className="mt-6 h-8 w-48 animate-pulse rounded-xl bg-accent/10" /><p className="mt-5 text-xs font-black uppercase tracking-wider text-muted">Carregando carta...</p></section></main>;
}
