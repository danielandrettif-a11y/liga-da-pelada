-- Cada tabela do Passe usa um tipo de NEW diferente. Manter as duas validacoes
-- na mesma trigger function fazia o PostgreSQL tentar acessar source_round_id
-- durante inserts da lojinha, que nao possui essa coluna.
BEGIN;

DROP TRIGGER IF EXISTS fantasy_pass_event_league_guard
  ON public.fantasy_season_pass_events;
DROP TRIGGER IF EXISTS fantasy_pass_shop_league_guard
  ON public.fantasy_season_pass_shop_items;

DROP FUNCTION IF EXISTS public.validate_fantasy_pass_event_link();
DROP FUNCTION IF EXISTS public.validate_fantasy_pass_shop_link();

CREATE FUNCTION public.validate_fantasy_pass_event_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_league_id uuid;
  round_league_id uuid;
BEGIN
  IF NEW.source_round_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT league_id
  INTO expected_league_id
  FROM public.fantasy_seasons
  WHERE id = NEW.fantasy_season_id;

  SELECT league_id
  INTO round_league_id
  FROM public.rounds
  WHERE id = NEW.source_round_id;

  IF expected_league_id IS NULL OR round_league_id IS DISTINCT FROM expected_league_id THEN
    RAISE EXCEPTION 'Evento do Passe referencia rodada de outra pelada';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.validate_fantasy_pass_shop_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  reward_season_id uuid;
BEGIN
  SELECT fantasy_season_id
  INTO reward_season_id
  FROM public.fantasy_season_pass_rewards
  WHERE id = NEW.source_reward_id;

  IF reward_season_id IS NULL OR reward_season_id IS DISTINCT FROM NEW.fantasy_season_id THEN
    RAISE EXCEPTION 'Oferta do Passe referencia outra temporada';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER fantasy_pass_event_league_guard
  BEFORE INSERT OR UPDATE OF fantasy_season_id, source_round_id
  ON public.fantasy_season_pass_events
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_fantasy_pass_event_link();

CREATE TRIGGER fantasy_pass_shop_league_guard
  BEFORE INSERT OR UPDATE OF fantasy_season_id, source_reward_id
  ON public.fantasy_season_pass_shop_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_fantasy_pass_shop_link();

DROP FUNCTION IF EXISTS public.validate_fantasy_pass_links();

REVOKE ALL ON FUNCTION public.validate_fantasy_pass_event_link(),
  public.validate_fantasy_pass_shop_link()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
