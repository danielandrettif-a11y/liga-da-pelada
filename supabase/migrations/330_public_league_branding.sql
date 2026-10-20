-- Expõe a identidade visual configurada pelo administrador no catálogo de peladas.
BEGIN;

DROP FUNCTION IF EXISTS public.find_leagues(text);

CREATE FUNCTION public.find_leagues(p_query text DEFAULT '')
RETURNS TABLE(
  league_id uuid,
  league_name text,
  league_slug text,
  feature_tier text,
  visibility text,
  logo_url text,
  cover_url text,
  accent_color text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    league.id,
    league.name,
    league.slug,
    league.feature_tier,
    league.visibility,
    league.logo_url,
    league.cover_url,
    league.accent_color
  FROM public.leagues league
  WHERE auth.uid() IS NOT NULL
    AND league.is_active
    AND (
      NULLIF(btrim(p_query), '') IS NULL
      OR league.name ILIKE '%' || replace(
        replace(left(btrim(p_query), 80), '%', '\%'), '_', '\_'
      ) || '%' ESCAPE '\'
    )
  ORDER BY
    CASE WHEN league.visibility = 'open' THEN 0 ELSE 1 END,
    league.name;
$$;

REVOKE ALL ON FUNCTION public.find_leagues(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_leagues(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
