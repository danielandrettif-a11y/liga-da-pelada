export default function PagamentosLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Carregando pagamentos">
      <div>
        <div className="h-6 w-44 rounded bg-surface-hover" />
        <div className="mt-1 h-3.5 w-56 rounded bg-surface-hover/60" />
      </div>

      {/* PIX Details card */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 rounded bg-surface-hover" />
          <div className="h-5 w-24 rounded-full bg-surface-hover/70" />
        </div>
        <div className="h-12 w-full rounded-xl bg-surface-hover/60" />
      </div>

      {/* Checklist */}
      <div className="space-y-3">
        <div className="h-4 w-36 rounded bg-surface-hover/60 px-1" />
        <div className="glass-card overflow-hidden divide-y divide-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 flex-shrink-0 rounded-full bg-surface-hover" />
                <div className="space-y-1">
                  <div className="h-4 w-32 rounded bg-surface-hover" />
                  <div className="h-3 w-16 rounded bg-surface-hover/50" />
                </div>
              </div>
              <div className="h-8 w-20 rounded-xl bg-surface-hover/70" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Carregando pagamentos...</span>
    </div>
  );
}
