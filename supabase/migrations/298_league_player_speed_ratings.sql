-- Velocidade pertence a cada pelada. Apenas a BQ original herda as estrelas
-- antigas; um atleta compartilhado com outra pelada comeca sem avaliacao.
BEGIN;

ALTER TABLE public.league_members
  ADD COLUMN IF NOT EXISTS speed_rating smallint
  CHECK (speed_rating IS NULL OR speed_rating BETWEEN 1 AND 3);

UPDATE public.league_members member SET speed_rating = attributes.speed_rating
FROM public.player_admin_attributes attributes,
  public.manager_source_league source
WHERE source.singleton = true AND member.league_id = source.league_id
  AND member.player_id = attributes.player_id AND member.speed_rating IS NULL;

CREATE OR REPLACE FUNCTION public.get_public_player_speed_ratings_for_league(p_league_id uuid)
RETURNS TABLE(player_id uuid, speed_rating smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT member.player_id, member.speed_rating
  FROM public.league_members member
  JOIN public.players player ON player.id = member.player_id
  WHERE member.league_id = p_league_id AND member.is_active
    AND public.is_league_member(p_league_id)
    AND player.member_category = 'player' AND player.is_selectable
    AND member.player_profile IN ('defensive','offensive')
    AND COALESCE(cardinality(member.overall_traits), 0) BETWEEN 1 AND 2
    AND member.speed_rating BETWEEN 1 AND 3;
$$;

-- As duas rotinas atuais do Draft ainda congelam a velocidade da tabela
-- global. Corrigir o corpo em uso, mantendo a formula e os demais scouts.
DO $$
DECLARE function_name text; definition text;
  source_join constant text :=
    'LEFT JOIN public.player_admin_attributes attributes ON attributes.player_id = player.id';
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'public.create_team_draft(uuid,uuid,uuid[])',
    'public.sync_active_team_draft_from_callup()'
  ] LOOP
    SELECT pg_get_functiondef(function_name::regprocedure) INTO definition;
    IF position(source_join IN definition) = 0
      OR position('attributes.speed_rating' IN definition) = 0 THEN
      RAISE EXCEPTION 'Draft % divergiu; revisar antes de aplicar a 298.', function_name;
    END IF;
    definition := replace(definition, source_join, '');
    definition := replace(definition, 'attributes.speed_rating', 'member.speed_rating');
    EXECUTE definition;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_player_speed_ratings(),
  public.get_public_player_speed_ratings_for_league(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_player_speed_ratings_for_league(uuid)
  TO authenticated;

-- Nenhuma acao atual deve continuar lendo ou escrevendo a tabela global.
REVOKE ALL ON public.player_admin_attributes FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
