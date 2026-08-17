export default function MaisLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Carregando menu">
      <div className="h-7 w-20 rounded bg-surface-hover" />

      {/* Account connected card */}
      <div className="glass-card flex items-center gap-3 p-4">
        <div className="h-11 w-11 flex-shrink-0 rounded-full bg-surface-hover" />
        <div className="flex-1 space-y-1.5 min-w-0">
          <div className="h-3 w-24 rounded bg-surface-hover/60" />
          <div className="h-4 w-32 rounded bg-surface-hover" />
          <div className="h-3 w-40 rounded bg-surface-hover/50" />
        </div>
        <div className="h-5 w-12 rounded-full bg-surface-hover/70" />
      </div>

      {/* Admin Modules Skeletons */}
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-surface-hover/60 px-1" />
        <div className="glass-card overflow-hidden divide-y divide-border">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-surface-hover" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-28 rounded bg-surface-hover" />
                <div className="h-3 w-44 rounded bg-surface-hover/50" />
              </div>
              <div className="h-4 w-4 rounded bg-surface-hover/40" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Carregando menu...</span>
    </div>
  );
}
