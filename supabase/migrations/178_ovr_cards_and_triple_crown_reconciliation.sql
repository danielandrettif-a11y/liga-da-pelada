-- Corrige dois pontos de leitura/reprocessamento:
-- 1. cartas de jogador passam a buscar o snapshot mais recente por atleta;
-- 2. Tríplice Coroa é reconciliada depois de todos os scouts oficiais.

drop function if exists public.get_latest_player_card_overalls();

create function public.get_latest_player_card_overalls()
returns table (
  player_id uuid,
  overall numeric,
  trend text,
  def_overall numeric,
  ala_mei_overall numeric,
  ata_overall numeric,
  gol_overall numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  with compatible_snapshots as (
    select
      snapshot.player_id,
      snapshot.overall,
      coalesce(snapshot.data_quality ->> 'overall_trend', 'steady') as trend,
      snapshot.def_overall,
      snapshot.ala_mei_overall,
      snapshot.ata_overall,
      snapshot.gol_overall,
      row_number() over (
        partition by snapshot.player_id
        order by
          case formula.key
            when 'adaptive-v11-balanced-characteristics' then 0
            when 'adaptive-v10-role-reframe' then 1
            when 'adaptive-v9-player-form-trend-shadow' then 2
            else 3
          end,
          run.created_at desc,
          run.id desc
      ) as snapshot_rank
    from public.player_overall_snapshots as snapshot
    inner join public.overall_calculation_runs as run
      on run.id = snapshot.calculation_run_id
    inner join public.overall_formula_versions as formula
      on formula.id = run.formula_version_id
    where formula.key in (
      'adaptive-v11-balanced-characteristics',
      'adaptive-v10-role-reframe',
      'adaptive-v9-player-form-trend-shadow',
      'adaptive-v8-soft-progression-shadow'
    )
      and run.status in ('succeeded', 'published')
  )
  select
    compatible.player_id,
    compatible.overall,
    compatible.trend,
    compatible.def_overall,
    compatible.ala_mei_overall,
    compatible.ata_overall,
    compatible.gol_overall
  from compatible_snapshots as compatible
  where compatible.snapshot_rank = 1;
$function$;

revoke all on function public.get_latest_player_card_overalls() from public;
grant execute on function public.get_latest_player_card_overalls() to anon, authenticated;

create or replace function public.reconcile_fantasy_triple_crown(p_round_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  fantasy_round public.fantasy_rounds%rowtype;
  activation record;
  target_player_id uuid;
  lineup_id uuid;
  stat_goals integer;
  stat_assists integer;
  stat_wins integer;
  old_bonus numeric;
  new_bonus numeric;
  applied boolean;
  details text;
begin
  select * into fantasy_round
  from public.fantasy_rounds
  where round_id = p_round_id;
  if not found then return true; end if;

  for activation in
    select item.*, card.slug
    from public.fantasy_card_activations item
    join public.fantasy_cards card on card.id = item.card_id
    where item.round_id = p_round_id
      and card.slug = 'triple_crown'
      and item.status in ('RESERVED', 'LOCKED', 'RESOLVED')
    for update of item
  loop
    select lineup.id into lineup_id
    from public.fantasy_lineups lineup
    where lineup.fantasy_round_id = fantasy_round.id
      and lineup.user_id = activation.user_id
      and lineup.status = 'scored';
    if not found then continue; end if;

    target_player_id := nullif(activation.target_snapshot ->> 'targetPlayerId', '')::uuid;
    select coalesce(stat.goals, 0), coalesce(stat.assists, 0), coalesce(stat.wins, 0)
      into stat_goals, stat_assists, stat_wins
    from public.player_round_stats stat
    where stat.round_id = p_round_id
      and stat.player_id = target_player_id;
    stat_goals := coalesce(stat_goals, 0);
    stat_assists := coalesce(stat_assists, 0);
    stat_wins := coalesce(stat_wins, 0);

    applied := target_player_id is not null
      and stat_goals >= coalesce((activation.effect_snapshot -> 'effectConfig' ->> 'minGoals')::integer, 1)
      and stat_assists >= coalesce((activation.effect_snapshot -> 'effectConfig' ->> 'minAssists')::integer, 1)
      and stat_wins >= coalesce((activation.effect_snapshot -> 'effectConfig' ->> 'minWins')::integer, 1);
    old_bonus := coalesce(activation.result_bonus, 0);
    new_bonus := case when applied
      then coalesce((activation.effect_snapshot -> 'effectConfig' ->> 'bonus')::numeric, 6)
      else 0
    end;
    details := case when applied
      then format('Tríplice Coroa concluída: %s gol(s), %s assistência(s) e %s vitória(s).', stat_goals, stat_assists, stat_wins)
      else format('Tríplice Coroa não concluída: %s gol(s), %s assistência(s) e %s vitória(s).', stat_goals, stat_assists, stat_wins)
    end;

    update public.fantasy_lineups
    set total_points = coalesce(total_points, 0) + new_bonus - old_bonus,
        score_breakdown = coalesce(score_breakdown, '{}'::jsonb) || jsonb_build_object(
          'cardBonus', new_bonus,
          'cardSlug', 'triple_crown',
          'cardDescription', details
        ),
        updated_at = now()
    where id = lineup_id;

    update public.fantasy_card_activations
    set status = 'RESOLVED',
        result_bonus = new_bonus,
        result_details = jsonb_build_object(
          'applied', applied,
          'description', details,
          'goals', stat_goals,
          'assists', stat_assists,
          'wins', stat_wins
        ),
        locked_at = coalesce(locked_at, now()),
        resolved_at = now()
    where id = activation.id;

    update public.fantasy_user_cards
    set status = 'CONSUMED', consumed_at = coalesce(consumed_at, now())
    where id = activation.user_card_id;
  end loop;

  with ranked as (
    select id, rank() over (order by total_points desc) as position
    from public.fantasy_lineups
    where fantasy_round_id = fantasy_round.id and status = 'scored'
  )
  update public.fantasy_lineups lineup
  set round_position = ranked.position
  from ranked
  where lineup.id = ranked.id;

  update public.fantasy_accounts account
  set total_points = totals.total_points,
      rounds_played = totals.rounds_played,
      best_round_points = totals.best_round,
      updated_at = now()
  from (
    select lineup.user_id,
      sum(lineup.total_points) as total_points,
      count(*)::integer as rounds_played,
      max(lineup.total_points) as best_round
    from public.fantasy_lineups lineup
    join public.fantasy_rounds round_data on round_data.id = lineup.fantasy_round_id
    where round_data.fantasy_season_id = fantasy_round.fantasy_season_id
      and lineup.status = 'scored'
    group by lineup.user_id
  ) totals
  where account.fantasy_season_id = fantasy_round.fantasy_season_id
    and account.user_id = totals.user_id;

  return true;
end;
$$;

do $$
begin
  if to_regprocedure('public.process_fantasy_round_pre_reconcile_177(uuid)') is null then
    alter function public.process_fantasy_round(uuid)
      rename to process_fantasy_round_pre_reconcile_177;
  end if;
end $$;

create or replace function public.process_fantasy_round(p_round_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.process_fantasy_round_pre_reconcile_177(p_round_id);
  perform public.reconcile_fantasy_triple_crown(p_round_id);
  return true;
end;
$$;

-- Repara rodadas antigas sem somar o bônus novamente em execuções futuras.
select public.reconcile_fantasy_triple_crown(activation.round_id)
from public.fantasy_card_activations activation
join public.fantasy_cards card on card.id = activation.card_id
join public.rounds round_item on round_item.id = activation.round_id
where card.slug = 'triple_crown'
  and round_item.status = 'finished'
group by activation.round_id;

-- A convocação convertida continua aberta para consulta até o primeiro jogo.
-- Se o próprio atleta desistir nesse intervalo, preservamos time e ordens da
-- vaga; normalize_callup_positions promove a fila e o trigger da migration
-- 177 encaixa o promovido exatamente no espaço que foi aberto.
create or replace function public.leave_callup(p_callup_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_player_id uuid;
  current_status text;
  current_callup public.callups%rowtype;
  previous_team_player public.team_players%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para sair.';
  end if;

  select profile.player_id into current_player_id
  from public.account_profiles profile
  where profile.user_id = auth.uid();
  if current_player_id is null then
    raise exception 'Sua conta não está vinculada a um jogador.';
  end if;

  select * into current_callup
  from public.callups
  where id = p_callup_id
    and status in ('open', 'converted')
  for update;
  if not found then
    raise exception 'A convocação não está disponível para desistência.';
  end if;

  select entry.status into current_status
  from public.callup_entries entry
  where entry.callup_id = p_callup_id
    and entry.player_id = current_player_id
  for update;
  if current_status is null then return true; end if;

  if current_callup.round_id is not null then
    if exists (
      select 1 from public.matches match_item
      where match_item.round_id = current_callup.round_id
        and (match_item.started_at is not null or match_item.status in ('live', 'finished'))
    ) then
      raise exception 'A convocação foi encerrada porque o primeiro jogo já começou.';
    end if;

    select team_player.* into previous_team_player
    from public.team_players team_player
    join public.teams team on team.id = team_player.team_id
    where team.round_id = current_callup.round_id
      and team_player.player_id = current_player_id
    for update of team_player;

    if found then
      if exists (
        select 1 from public.callup_replacement_slots slot
        where slot.callup_id = p_callup_id
          and slot.team_id = previous_team_player.team_id
          and slot.replacement_player_id is null
      ) then
        raise exception 'Este time já possui uma vaga aguardando reposição.';
      end if;

      delete from public.team_players where id = previous_team_player.id;
      delete from public.round_players
      where round_id = current_callup.round_id and player_id = current_player_id;
      update public.teams
      set captain_player_id = null
      where id = previous_team_player.team_id
        and captain_player_id = current_player_id;

      insert into public.callup_replacement_slots (
        callup_id, round_id, team_id, vacated_player_id, goalkeeper_order, loan_order
      ) values (
        p_callup_id, current_callup.round_id, previous_team_player.team_id,
        current_player_id, previous_team_player.goalkeeper_order, previous_team_player.loan_order
      );
    elsif current_status = 'confirmed' then
      raise exception 'Não foi possível localizar a vaga deste jogador nos times sorteados.';
    end if;
  end if;

  delete from public.callup_entries
  where callup_id = p_callup_id and player_id = current_player_id;
  perform public.normalize_callup_positions(p_callup_id);

  update public.callups callup
  set status = case
        when exists (
          select 1 from public.callup_replacement_slots slot
          where slot.callup_id = callup.id and slot.replacement_player_id is null
        ) then 'open'
        when callup.round_id is not null then 'converted'
        else 'open'
      end,
      updated_at = now()
  where callup.id = p_callup_id;

  return true;
end;
$$;

revoke all on function public.reconcile_fantasy_triple_crown(uuid) from public, anon, authenticated;
revoke all on function public.process_fantasy_round_pre_reconcile_177(uuid) from public, anon, authenticated;
grant execute on function public.process_fantasy_round(uuid) to authenticated;
revoke all on function public.leave_callup(uuid) from public, anon;
grant execute on function public.leave_callup(uuid) to authenticated;

notify pgrst, 'reload schema';
