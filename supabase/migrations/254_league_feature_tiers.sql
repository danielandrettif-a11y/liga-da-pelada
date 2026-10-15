-- A BQ e todas as peladas existentes mantem todos os recursos.
-- Novas peladas escolhem basic ou complete na criacao. Upgrade apenas de
-- basic para complete; nunca remove historico nem desativa recursos existentes.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS feature_tier text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS full_enabled_at timestamptz;

ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_feature_tier_check;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_feature_tier_check
  CHECK (feature_tier IN ('basic', 'complete'));

UPDATE public.leagues SET full_enabled_at = COALESCE(full_enabled_at, created_at)
WHERE feature_tier = 'complete';

CREATE OR REPLACE FUNCTION public.enforce_league_feature_upgrade()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.feature_tier = 'complete' AND NEW.feature_tier = 'basic' THEN
    RAISE EXCEPTION 'Nao e permitido voltar uma pelada completa para basica.';
  END IF;
  IF OLD.feature_tier = 'basic' AND NEW.feature_tier = 'complete' THEN
    NEW.full_enabled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leagues_feature_upgrade_guard ON public.leagues;
CREATE TRIGGER leagues_feature_upgrade_guard BEFORE UPDATE OF feature_tier
ON public.leagues FOR EACH ROW EXECUTE FUNCTION public.enforce_league_feature_upgrade();

CREATE OR REPLACE FUNCTION public.upgrade_league_to_complete(p_league_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_tier text;
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente ADM da pelada pode liberar a versao completa.';
  END IF;
  SELECT feature_tier INTO current_tier FROM public.leagues
  WHERE id = p_league_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelada nao encontrada.'; END IF;
  IF current_tier = 'complete' THEN RETURN false; END IF;

  UPDATE public.leagues SET feature_tier = 'complete' WHERE id = p_league_id;
  INSERT INTO public.fantasy_settings (league_id) VALUES (p_league_id)
  ON CONFLICT (league_id) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.upgrade_league_to_complete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upgrade_league_to_complete(uuid) TO authenticated;

-- O trigger historico chama esta funcao ao criar toda rodada oficial. Uma
-- pelada Basica nao deve ganhar temporada/precos de Cartola implicitamente.
-- Na Completa, o mercado inclui apenas atletas vinculados a esta pelada.
CREATE OR REPLACE FUNCTION public.ensure_fantasy_round(p_round_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_round public.rounds%ROWTYPE;
  current_settings public.fantasy_settings%ROWTYPE;
  fantasy_season_id uuid;
  fantasy_round_id uuid;
BEGIN
  SELECT round_item.* INTO current_round FROM public.rounds round_item
  JOIN public.leagues league ON league.id = round_item.league_id
  WHERE round_item.id = p_round_id AND league.feature_tier = 'complete';
  IF NOT FOUND OR current_round.round_type <> 'official' OR current_round.status = 'finished' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.fantasy_settings (league_id) VALUES (current_round.league_id)
  ON CONFLICT (league_id) DO NOTHING;
  SELECT * INTO current_settings FROM public.fantasy_settings
  WHERE league_id = current_round.league_id;

  INSERT INTO public.fantasy_seasons (league_id, season_id, initial_budget, initial_player_price)
  VALUES (current_round.league_id, current_round.season_id,
    current_settings.initial_budget, current_settings.initial_player_price)
  ON CONFLICT (season_id) DO UPDATE SET league_id = EXCLUDED.league_id
  RETURNING id INTO fantasy_season_id;

  INSERT INTO public.fantasy_player_prices (fantasy_season_id, player_id, current_price)
  SELECT fantasy_season_id, player.id, current_settings.initial_player_price
  FROM public.league_members member JOIN public.players player ON player.id = member.player_id
  WHERE member.league_id = current_round.league_id AND member.is_active
    AND player.is_selectable AND player.member_category IN ('player', 'guest')
  ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;

  INSERT INTO public.fantasy_rounds (fantasy_season_id, round_id, settings_snapshot)
  VALUES (fantasy_season_id, current_round.id,
    to_jsonb(current_settings) - 'league_id' - 'updated_at')
  ON CONFLICT (round_id) DO UPDATE SET round_id = EXCLUDED.round_id
  RETURNING id INTO fantasy_round_id;
  RETURN fantasy_round_id;
END;
$$;

-- O upgrade abre o Cartola apenas para rodadas futuras. As rodadas que a liga
-- disputou no modo Basico continuam fechadas, sem reprocessar seu historico.
CREATE OR REPLACE FUNCTION public.create_fantasy_round_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.round_type = 'official' AND NEW.status <> 'finished' THEN
      PERFORM public.ensure_fantasy_round(NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.round_type = 'official' AND NEW.status <> 'finished'
      AND (NEW.round_type IS DISTINCT FROM OLD.round_type OR NEW.status IS DISTINCT FROM OLD.status)
      AND NOT EXISTS (SELECT 1 FROM public.matches WHERE round_id = NEW.id) THEN
      PERFORM public.ensure_fantasy_round(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
