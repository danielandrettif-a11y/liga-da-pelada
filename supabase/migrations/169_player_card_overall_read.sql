-- Publica somente o OVR geral usado nas cartas dos jogadores. Os detalhes da
-- fórmula, execuções e notas por posição continuam protegidos pelo RLS.

create or replace function public.get_latest_player_card_overalls()
returns table (
  player_id uuid,
  overall numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  select snapshot.player_id, snapshot.overall
  from public.player_overall_snapshots as snapshot
  inner join (
    select run.id
    from public.overall_calculation_runs as run
    inner join public.overall_formula_versions as formula
      on formula.id = run.formula_version_id
    where formula.key = 'adaptive-v8-soft-progression-shadow'
      and run.status in ('succeeded', 'published')
    order by run.created_at desc, run.id desc
    limit 1
  ) as latest_run
    on latest_run.id = snapshot.calculation_run_id;
$function$;

revoke all on function public.get_latest_player_card_overalls() from public;
grant execute on function public.get_latest_player_card_overalls() to anon, authenticated;

notify pgrst, 'reload schema';
