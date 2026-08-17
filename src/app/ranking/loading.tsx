export default function RankingLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Carregando ranking">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-6 w-32 rounded bg-surface-hover" />
          <div className="h-3.5 w-40 rounded bg-surface-hover/60" />
        </div>
        <div className="h-6 w-24 rounded-full bg-surface-hover/70" />
      </div>

      {/* Segment Tabs */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1.5 border border-border">
        <div className="h-10 rounded-xl bg-surface-hover" />
        <div className="h-10 rounded-xl bg-surface-hover/50" />
      </div>

      {/* Podium Top 3 */}
      <div className="grid grid-cols-3 gap-2 items-end pt-4">
        {/* 2nd place */}
        <div className="flex flex-col items-center space-y-2">
          <div className="h-14 w-14 rounded-full bg-surface-hover" />
          <div className="h-3.5 w-16 rounded bg-surface-hover" />
          <div className="h-24 w-full rounded-2xl border border-border bg-surface p-2" />
        </div>
        {/* 1st place */}
        <div className="flex flex-col items-center space-y-2">
          <div className="h-16 w-16 rounded-full ring-2 ring-accent/30 bg-surface-hover" />
          <div className="h-4 w-20 rounded bg-surface-hover" />
          <div className="h-32 w-full rounded-2xl border border-border bg-surface p-2" />
        </div>
        {/* 3rd place */}
        <div className="flex flex-col items-center space-y-2">
          <div className="h-14 w-14 rounded-full bg-surface-hover" />
          <div className="h-3.5 w-16 rounded bg-surface-hover" />
          <div className="h-20 w-full rounded-2xl border border-border bg-surface p-2" />
        </div>
      </div>

      {/* Table rows list */}
      <div className="glass-card overflow-hidden divide-y divide-border">
        {[4, 5, 6, 7, 8].map((pos) => (
          <div key={pos} className="flex items-center gap-3 px-4 py-3.5">
            <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-surface-hover text-center" />
            <div className="h-9 w-9 flex-shrink-0 rounded-full bg-surface-hover" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="h-4 w-32 rounded bg-surface-hover" />
              <div className="h-3 w-20 rounded bg-surface-hover/50" />
            </div>
            <div className="space-y-1 text-right">
              <div className="h-5 w-12 rounded bg-surface-hover" />
              <div className="h-2.5 w-6 ml-auto rounded bg-surface-hover/50" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only">Carregando ranking...</span>
    </div>
  );
}
