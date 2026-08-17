export default function RodadaDetalheLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Carregando detalhes da rodada">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-surface-hover" />
          <div className="space-y-1.5">
            <div className="h-6 w-32 rounded bg-surface-hover" />
            <div className="h-3.5 w-24 rounded bg-surface-hover/60" />
          </div>
        </div>
      </div>

      {/* Stadium pill */}
      <div className="h-10 rounded-xl bg-surface-hover/70" />

      {/* Button if applicable */}
      <div className="h-12 w-full rounded-2xl bg-surface-hover/80" />

      {/* Teams Grid Section */}
      <section className="space-y-3">
        <div className="h-4 w-32 rounded bg-surface-hover/60 px-1" />
        <div className="-mx-2 grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-2xl border border-border bg-surface p-2.5 space-y-2">
              <div className="h-4 w-full rounded bg-surface-hover" />
              <div className="h-16 w-full rounded-xl bg-surface-hover/40" />
              <div className="space-y-1">
                <div className="h-3 w-3/4 rounded bg-surface-hover/60" />
                <div className="h-3 w-1/2 rounded bg-surface-hover/40" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Matches Section */}
      <section className="space-y-3">
        <div className="h-4 w-28 rounded bg-surface-hover/60 px-1" />
        <div className="glass-card p-4 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-surface-hover/50" />
          ))}
        </div>
      </section>

      <span className="sr-only">Carregando detalhes da rodada...</span>
    </div>
  );
}
