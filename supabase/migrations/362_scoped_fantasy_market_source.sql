-- Expõe o modelo de mercado existente somente aos membros da pelada da temporada.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_scoped_fantasy_market_source(p_fantasy_season_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target_league uuid;
BEGIN
  SELECT fs.league_id INTO target_league FROM public.fantasy_seasons fs
  JOIN public.seasons s ON s.id=fs.season_id AND s.league_id=fs.league_id
  WHERE fs.id=p_fantasy_season_id AND s.status='active';
  IF target_league IS NULL OR NOT public.is_league_member(target_league) THEN
    RAISE EXCEPTION 'Temporada indisponível ou acesso não autorizado.';
  END IF;
  RETURN public.get_fantasy_market_cache_source(p_fantasy_season_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_scoped_fantasy_market_source(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scoped_fantasy_market_source(uuid) TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
