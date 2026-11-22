-- A validacao de elenco tambem atende a sessao de teste de amistosos, que
-- possui fantasy_test_sessions e nao necessariamente fantasy_rounds.
BEGIN;
DO $$
DECLARE definition text;
  old_joins constant text := 'JOIN public[.]fantasy_rounds fantasy_round[[:space:]]+ON fantasy_round[.]round_id = round_item[.]id[[:space:]]+JOIN public[.]fantasy_seasons fantasy_season[[:space:]]+ON fantasy_season[.]id = fantasy_round[.]fantasy_season_id[[:space:]]+AND fantasy_season[.]league_id = round_item[.]league_id[[:space:]]+';
  old_where constant text := 'WHERE round_item.id = p_round_id;';
  new_where constant text := 'WHERE round_item.id = p_round_id AND (
    EXISTS (SELECT 1 FROM public.fantasy_rounds fr JOIN public.fantasy_seasons fs ON fs.id=fr.fantasy_season_id AND fs.league_id=round_item.league_id WHERE fr.round_id=round_item.id)
    OR EXISTS (SELECT 1 FROM public.fantasy_test_sessions ts WHERE ts.round_id=round_item.id AND ts.league_id=round_item.league_id)
  );';
BEGIN
  SELECT pg_get_functiondef('public.assert_fantasy_selection_in_league(uuid,uuid[],uuid)'::regprocedure) INTO definition;
  IF (SELECT count(*) FROM regexp_matches(definition,old_joins,'g')) <> 1 OR position(old_where IN definition)=0 THEN
    RAISE EXCEPTION 'Validacao de elenco divergiu; revisar antes da migration 359.';
  END IF;
  definition := regexp_replace(definition,old_joins,'');
  EXECUTE replace(definition,old_where,new_where);
END $$;
COMMIT;
