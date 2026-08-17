export default function RodadasLoading() {
  return (
    <div className="space-y-5 animate-pulse" role="status" aria-label="Carregando rodadas">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-6 w-28 rounded-lg bg-surface-hover" />
          <div className="h-3.5 w-36 rounded bg-surface-hover/60" />
        </div>
        <div className="h-10 w-28 rounded-xl bg-surface-hover/80" />
      </div>

      {/* Rounds List Skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-4">
            <div className="flex items-center gap-4">
              {/* Round number box */}
              <div className="h-14 w-14 flex-shrink-0 rounded-xl bg-surface-hover" />

              {/* Info lines */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-28 rounded bg-surface-hover" />
                  <div className="h-4 w-16 rounded-full bg-surface-hover/70" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-20 rounded bg-surface-hover/60" />
                  <div className="h-3 w-24 rounded bg-surface-hover/60" />
                </div>
              </div>

              {/* Arrow placeholder */}
              <div className="h-5 w-5 rounded-full bg-surface-hover/40 flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando rodadas...</span>
    </div>
  );
}
