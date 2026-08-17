export default function CartolaLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Carregando Cartola">
      {/* Banner / Header */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-6 w-28 rounded bg-surface-hover" />
          <div className="h-5 w-20 rounded-full bg-surface-hover/70" />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="h-16 rounded-xl bg-surface-hover/50 p-2" />
          <div className="h-16 rounded-xl bg-surface-hover/50 p-2" />
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1 border border-border">
        <div className="h-9 rounded-xl bg-surface-hover" />
        <div className="h-9 rounded-xl bg-surface-hover/50" />
        <div className="h-9 rounded-xl bg-surface-hover/50" />
      </div>

      {/* Market Players List */}
      <div className="glass-card overflow-hidden divide-y divide-border">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-surface-hover" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="h-4 w-32 rounded bg-surface-hover" />
              <div className="h-3 w-20 rounded bg-surface-hover/60" />
            </div>
            <div className="h-8 w-16 rounded-xl bg-surface-hover/70" />
          </div>
        ))}
      </div>

      <span className="sr-only">Carregando Cartola...</span>
    </div>
  );
}
