-- O portfolio permanente e suas vagas passam a usar o perfil competitivo da
-- pelada. Escalacoes historicas nao sao regravadas.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_fantasy_portfolio(
  p_fantasy_season_id uuid, p_player_ids uuid[],
  p_captain_player_id uuid, p_lineup_slots jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league_id uuid; team_size integer; selected_count integer;
  eligible_count integer; saved uuid;
BEGIN
  SELECT season_item.league_id, league.players_per_team
    INTO target_league_id, team_size
  FROM public.fantasy_seasons season_item
  JOIN public.seasons season ON season.id = season_item.season_id
    AND season.league_id = season_item.league_id
  JOIN public.leagues league ON league.id = season_item.league_id
    AND league.is_active AND league.feature_tier = 'complete'
  WHERE season_item.id = p_fantasy_season_id;
  IF target_league_id IS NULL OR NOT public.is_league_member(target_league_id) THEN
    RAISE EXCEPTION 'Portfolio indisponivel nesta pelada.';
  END IF;
  selected_count := COALESCE(cardinality(p_player_ids), 0);
  IF selected_count <> (SELECT count(DISTINCT selected.player_id)
    FROM unnest(COALESCE(p_player_ids, ARRAY[]::uuid[])) selected(player_id)) THEN
    RAISE EXCEPTION 'O portfolio contem atletas repetidos.';
  END IF;
  SELECT count(*) INTO eligible_count
  FROM public.league_members member
  JOIN public.players player ON player.id = member.player_id
  WHERE member.league_id = target_league_id AND member.is_active
    AND member.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::uuid[]))
    AND player.member_category = 'player' AND player.is_selectable;
  IF eligible_count <> selected_count THEN
    RAISE EXCEPTION 'O portfolio contem atleta de outra pelada ou indisponivel.';
  END IF;
  IF p_captain_player_id IS NOT NULL
    AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::uuid[]))) THEN
    RAISE EXCEPTION 'O capitao precisa estar no portfolio.';
  END IF;
  IF jsonb_typeof(COALESCE(p_lineup_slots, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Vagas invalidas no portfolio.';
  END IF;
  IF jsonb_array_length(COALESCE(p_lineup_slots, '[]'::jsonb)) > 0
    AND NOT public.is_valid_fantasy_formation_v11(p_lineup_slots, team_size) THEN
    RAISE EXCEPTION 'Use 1 GOL e 3 DEF + 2 ATA ou 2 DEF + 3 ATA.';
  END IF;

  saved := public.save_fantasy_portfolio_pre_three_positions_220(
    p_fantasy_season_id, p_player_ids, p_captain_player_id, p_lineup_slots);
  UPDATE public.fantasy_portfolio_players item SET
    player_profile_locked = member.player_profile,
    is_position_correct = CASE item.slot_role
      WHEN 'GOL' THEN true
      WHEN 'DEF' THEN member.player_profile = 'defensive'
      WHEN 'ATA' THEN member.player_profile = 'offensive'
      ELSE false END
  FROM public.league_members member
  WHERE item.portfolio_id = saved AND item.player_id = member.player_id
    AND member.league_id = target_league_id AND member.is_active;
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_portfolio_pre_three_positions_220(
  uuid,uuid[],uuid,jsonb),
  public.save_fantasy_portfolio(uuid,uuid[],uuid),
  public.save_fantasy_test_lineup(uuid,uuid[],uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_fantasy_portfolio(uuid,uuid[],uuid,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_portfolio(uuid,uuid[],uuid,jsonb)
  TO authenticated, service_role;

-- As versoes antigas foram renomeadas em migrations anteriores. Elas sao
-- chamadas apenas por rotinas SECURITY DEFINER atuais; nao podem continuar
-- expostas como RPC alternativa sem a checagem da pelada.
DO $$
DECLARE routine record;
BEGIN
  FOR routine IN
    SELECT procedure_item.oid::regprocedure AS signature
    FROM pg_proc procedure_item
    JOIN pg_namespace namespace_item ON namespace_item.oid = procedure_item.pronamespace
    WHERE namespace_item.nspname = 'public'
      AND (procedure_item.proname LIKE 'save_fantasy_lineup_pre_%'
        OR procedure_item.proname LIKE 'save_fantasy_test_lineup_pre_%'
        OR procedure_item.proname LIKE 'save_fantasy_portfolio_pre_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      routine.signature);
  END LOOP;
END;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
