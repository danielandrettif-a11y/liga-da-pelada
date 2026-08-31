export default function FantasyHistoryLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl animate-pulse space-y-4 py-4" aria-label="Carregando histórico do Cartola">
      <div className="h-9 w-52 rounded-xl bg-surface" />
      {[0, 1, 2, 3].map((item) => <div key={item} className="h-24 rounded-2xl border border-border bg-surface/70" />)}
    </div>
  );
}
