-- Corrige o processamento do Cartola V1 e adiciona penalidade configuravel por derrota.
-- Snapshots ja existentes continuam com derrota neutra; novas rodadas recebem o valor atual.

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS loss_points NUMERIC(8,2) NOT NULL DEFAULT -1;

CREATE OR REPLACE FUNCTION public.update_fantasy_loss_points(p_loss_points NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_league_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem configurar o Cartola.';
  END IF;
  IF p_loss_points IS NULL OR p_loss_points < -100 OR p_loss_points > 100 THEN
    RAISE EXCEPTION 'Pontuacao por derrota invalida.';
  END IF;

  SELECT id INTO active_league_id
  FROM public.leagues
  WHERE is_active = true
  ORDER BY created_at
  LIMIT 1;

  INSERT INTO public.fantasy_settings (league_id, loss_points)
  VALUES (active_league_id, p_loss_points)
  ON CONFLICT (league_id) DO UPDATE SET
    loss_points = EXCLUDED.loss_points,
    updated_at = now();

  INSERT INTO public.fantasy_audit_log (league_id, user_id, action, payload)
  VALUES (
    active_league_id,
    auth.uid(),
    'loss_points_updated',
    jsonb_build_object('loss_points', p_loss_points)
  );
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_fantasy_loss_points(NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION public.update_fantasy_loss_points(NUMERIC) FROM PUBLIC, anon;

-- A migration 039 preserva o processador principal da 038 com este nome.
-- Recriamos a definicao por transformacao controlada para manter todas as regras V1
-- e corrigir o tipo double precision produzido por percent_rank().
DO $$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.process_fantasy_round_legacy_v0(uuid)'::regprocedure)
  INTO function_definition;

  function_definition := replace(
    function_definition,
    'normalized.current_price * (1 + normalized.variation_rate)',
    '(normalized.current_price * (1 + normalized.variation_rate))::NUMERIC'
  );

  function_definition := regexp_replace(
    function_definition,
    '(COALESCE\(round_stat\.wins, 0\) \* \(settings_snapshot->>''win_points''\)::NUMERIC)( AS base_points)',
    E'\\1\n        + COALESCE(round_stat.losses, 0) * COALESCE((settings_snapshot->>''loss_points'')::NUMERIC, 0)\\2',
    'g'
  );

  function_definition := replace(
    function_definition,
    'COALESCE(round_stat.draws, 0)::INTEGER AS draws,',
    E'COALESCE(round_stat.draws, 0)::INTEGER AS draws,\n      COALESCE(round_stat.losses, 0)::INTEGER AS losses,'
  );
  function_definition := replace(
    function_definition,
    'jsonb_build_object(''score'', normalized.performance_score)',
    'jsonb_build_object(''score'', normalized.performance_score, ''losses'', normalized.losses, ''loss_points'', COALESCE((settings_snapshot->>''loss_points'')::NUMERIC, 0))'
  );

  function_definition := regexp_replace(
    function_definition,
    '(COALESCE\(round_stat\.wins, 0\) \* \(settings_snapshot->>''win_points''\)::NUMERIC)( AS round_points)',
    E'\\1\n        + COALESCE(round_stat.losses, 0) * COALESCE((settings_snapshot->>''loss_points'')::NUMERIC, 0)\\2',
    'g'
  );

  -- Garante que a migration falhe de forma clara se a funcao anterior mudou.
  IF function_definition NOT LIKE '%normalized.current_price%::NUMERIC%'
    OR function_definition NOT LIKE '%round_stat.losses%loss_points%'
  THEN
    RAISE EXCEPTION 'Nao foi possivel aplicar a correcao numerica no processador do Cartola.';
  END IF;

  EXECUTE function_definition;
END;
$$;
