export default function PartidaAoVivoLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Carregando partida">
      {/* Top back bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-surface-hover" />
          <div className="space-y-1">
            <div className="h-5 w-28 rounded bg-surface-hover" />
            <div className="h-3 w-20 rounded bg-surface-hover/60" />
          </div>
        </div>
        <div className="h-6 w-16 rounded-full bg-surface-hover" />
      </div>

      {/* Scoreboard Card */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-around">
          {/* Team A */}
          <div className="flex flex-col items-center space-y-2 flex-1">
            <div className="h-14 w-14 rounded-full bg-surface-hover" />
            <div className="h-4 w-20 rounded bg-surface-hover" />
          </div>

          {/* Score & Timer */}
          <div className="flex flex-col items-center space-y-2 px-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-surface-hover" />
              <div className="h-4 w-3 rounded bg-surface-hover/60" />
              <div className="h-10 w-10 rounded-xl bg-surface-hover" />
            </div>
            <div className="h-5 w-16 rounded-full bg-surface-hover/70" />
          </div>

          {/* Team B */}
          <div className="flex flex-col items-center space-y-2 flex-1">
            <div className="h-14 w-14 rounded-full bg-surface-hover" />
            <div className="h-4 w-20 rounded bg-surface-hover" />
          </div>
        </div>
      </div>

      {/* Events / Actions */}
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-surface-hover/60 px-1" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 rounded-2xl border border-border bg-surface p-3" />
          <div className="h-28 rounded-2xl border border-border bg-surface p-3" />
        </div>
      </div>

      <span className="sr-only">Carregando partida...</span>
    </div>
  );
}
