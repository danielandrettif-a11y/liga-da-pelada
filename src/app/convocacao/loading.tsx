export default function ConvocacaoLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Carregando convocação">
      <div className="space-y-1">
        <div className="h-6 w-36 rounded bg-surface-hover" />
        <div className="h-3.5 w-48 rounded bg-surface-hover/60" />
      </div>

      {/* Event Details Card */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-24 rounded bg-surface-hover" />
          <div className="h-5 w-20 rounded-full bg-surface-hover/70" />
        </div>
        <div className="h-10 rounded-xl bg-surface-hover/50" />
        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <div className="h-3 w-28 rounded bg-surface-hover/60" />
            <div className="h-3 w-12 rounded bg-surface-hover/60" />
          </div>
          <div className="h-3 w-full rounded-full bg-surface-hover/40" />
        </div>
      </div>

      {/* Confirmed List */}
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-surface-hover/60 px-1" />
        <div className="glass-card overflow-hidden divide-y divide-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="h-9 w-9 flex-shrink-0 rounded-full bg-surface-hover" />
              <div className="flex-1 space-y-1 min-w-0">
                <div className="h-4 w-32 rounded bg-surface-hover" />
                <div className="h-2.5 w-16 rounded bg-surface-hover/50" />
              </div>
              <div className="h-5 w-12 rounded-full bg-surface-hover/60" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Carregando convocação...</span>
    </div>
  );
}
