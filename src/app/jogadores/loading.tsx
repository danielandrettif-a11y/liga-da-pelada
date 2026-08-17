export default function JogadoresLoading() {
  return (
    <div className="space-y-5 animate-pulse" role="status" aria-label="Carregando elenco">
      {/* Header */}
      <div>
        <div className="h-6 w-24 rounded bg-surface-hover" />
        <div className="mt-1 h-3.5 w-64 rounded bg-surface-hover/60" />
      </div>

      {/* Search and Tabs */}
      <div className="space-y-3">
        <div className="h-11 w-full rounded-xl bg-surface-hover/70" />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[1, 2, 3, 4].map((t) => (
            <div key={t} className="h-8 w-24 flex-shrink-0 rounded-full bg-surface-hover/80" />
          ))}
        </div>
      </div>

      {/* Athletes Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-44 rounded-2xl border border-border bg-surface p-4 flex flex-col items-center justify-between">
            <div className="h-16 w-16 rounded-full bg-surface-hover" />
            <div className="w-full space-y-1.5 text-center">
              <div className="h-4 w-3/4 mx-auto rounded bg-surface-hover" />
              <div className="h-3 w-1/2 mx-auto rounded bg-surface-hover/50" />
            </div>
            <div className="h-6 w-full rounded-lg bg-surface-hover/60" />
          </div>
        ))}
      </div>

      <span className="sr-only">Carregando elenco...</span>
    </div>
  );
}
