export default function FantasyRankingLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl animate-pulse space-y-4 py-4" aria-label="Carregando ranking do Cartola">
      <div className="h-9 w-56 rounded-xl bg-surface" />
      <div className="h-14 rounded-2xl bg-surface" />
      {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-20 rounded-2xl border border-border bg-surface/70" />)}
    </div>
  );
}
