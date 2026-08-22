-- Permite que um ADM atualize uma rodada historica para as regras atualmente
-- configuradas e reprocesse toda a cadeia economica a partir dela.

CREATE OR REPLACE FUNCTION public.reprocess_fantasy_with_current_rules(p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.fantasy_rounds%ROWTYPE;
  target_round public.rounds%ROWTYPE;
  current_settings public.fantasy_settings%ROWTYPE;
  previous_snapshot JSONB;
  current_snapshot JSONB;
  affected_finished_rounds INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem atualizar regras historicas do Cartola.';
  END IF;

  SELECT * INTO target
  FROM public.fantasy_rounds
  WHERE round_id = p_round_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada do Cartola nao encontrada.'; END IF;

  SELECT * INTO target_round
  FROM public.rounds
  WHERE id = p_round_id
  FOR UPDATE;
  IF NOT FOUND OR target_round.status <> 'finished' THEN
    RAISE EXCEPTION 'A rodada precisa estar finalizada antes do reprocessamento.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fantasy_rounds later_fantasy
    JOIN public.rounds later_round ON later_round.id = later_fantasy.round_id
    WHERE later_fantasy.fantasy_season_id = target.fantasy_season_id
      AND (later_round.date, later_round.number) >= (target_round.date, target_round.number)
      AND later_fantasy.market_status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'Nao e possivel atualizar regras enquanto existe uma rodada posterior em andamento.';
  END IF;

  SELECT settings.* INTO current_settings
  FROM public.fantasy_settings settings
  JOIN public.fantasy_seasons season ON season.league_id = settings.league_id
  WHERE season.id = target.fantasy_season_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configuracoes atuais do Cartola nao encontradas.'; END IF;

  previous_snapshot := target.settings_snapshot;
  current_snapshot := previous_snapshot || (to_jsonb(current_settings) - 'league_id' - 'updated_at');

  UPDATE public.fantasy_rounds
  SET settings_snapshot = current_snapshot,
      rules_version = greatest(COALESCE(rules_version, 0), 1),
      scoring_version = greatest(COALESCE(scoring_version, 1), 2)
  WHERE id = target.id;

  SELECT count(*)::INTEGER INTO affected_finished_rounds
  FROM public.fantasy_rounds later_fantasy
  JOIN public.rounds later_round ON later_round.id = later_fantasy.round_id
  WHERE later_fantasy.fantasy_season_id = target.fantasy_season_id
    AND later_round.status = 'finished'
    AND (later_round.date, later_round.number) >= (target_round.date, target_round.number);

  INSERT INTO public.fantasy_audit_log (
    league_id, fantasy_round_id, user_id, action, payload
  ) VALUES (
    target_round.league_id,
    target.id,
    auth.uid(),
    'round_rules_upgraded_to_current',
    jsonb_build_object(
      'round_id', p_round_id,
      'previous_snapshot', previous_snapshot,
      'current_snapshot', current_snapshot,
      'previous_rules_version', target.rules_version,
      'previous_scoring_version', target.scoring_version,
      'new_rules_version', greatest(COALESCE(target.rules_version, 0), 1),
      'new_scoring_version', greatest(COALESCE(target.scoring_version, 1), 2),
      'affected_finished_rounds', affected_finished_rounds
    )
  );

  -- Esta funcao restaura precos/patrimonios e processa cronologicamente todas
  -- as rodadas posteriores. Qualquer falha desfaz esta transacao por completo.
  PERFORM public.reprocess_fantasy_from_round(p_round_id);

  RETURN jsonb_build_object(
    'round_id', p_round_id,
    'affected_finished_rounds', affected_finished_rounds,
    'rules_version', greatest(COALESCE(target.rules_version, 0), 1),
    'scoring_version', greatest(COALESCE(target.scoring_version, 1), 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reprocess_fantasy_with_current_rules(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reprocess_fantasy_with_current_rules(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
