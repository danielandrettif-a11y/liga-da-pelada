export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse" role="status" aria-label="Carregando página">
      <div className="h-7 w-40 rounded-lg bg-surface-hover" />
      <div className="h-24 rounded-2xl border border-border bg-surface" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 rounded-2xl border border-border bg-surface" />
        <div className="h-28 rounded-2xl border border-border bg-surface" />
      </div>
      <div className="h-40 rounded-2xl border border-border bg-surface" />
      <span className="sr-only">Carregando...</span>
    </div>
  );
}
