export default function JogadorPerfilLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Carregando perfil do jogador">
      {/* Top back bar */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-surface-hover" />
        <div className="h-4 w-16 rounded bg-surface-hover" />
      </div>

      {/* Main Hero Card */}
      <div className="glass-card flex flex-col items-center p-6 text-center space-y-3">
        <div className="h-24 w-24 rounded-full bg-surface-hover ring-2 ring-border" />
        <div className="h-7 w-44 rounded bg-surface-hover" />
        <div className="h-4 w-28 rounded bg-surface-hover/60" />
        <div className="flex gap-2">
          <div className="h-5 w-24 rounded-full bg-surface-hover/70" />
          <div className="h-5 w-20 rounded-full bg-surface-hover/70" />
        </div>
        {/* Points & Winrate Banner */}
        <div className="mt-4 flex items-center gap-6 rounded-2xl border border-border bg-surface/50 px-8 py-3.5">
          <div className="space-y-1">
            <div className="h-2.5 w-12 rounded bg-surface-hover/50" />
            <div className="h-7 w-12 rounded bg-surface-hover" />
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="space-y-1">
            <div className="h-2.5 w-12 rounded bg-surface-hover/50" />
            <div className="h-7 w-12 rounded bg-surface-hover" />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="space-y-3">
        <div className="h-3.5 w-20 rounded bg-surface-hover/60 px-1" />
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="glass-card p-3 text-center space-y-1">
              <div className="h-5 w-8 mx-auto rounded bg-surface-hover" />
              <div className="h-2 w-10 mx-auto rounded bg-surface-hover/50" />
            </div>
          ))}
        </div>
      </div>

      {/* Club goals */}
      <div className="space-y-3">
        <div className="h-3.5 w-28 rounded bg-surface-hover/60 px-1" />
        <div className="h-28 rounded-2xl border border-border bg-surface p-4" />
      </div>

      <span className="sr-only">Carregando perfil...</span>
    </div>
  );
}
