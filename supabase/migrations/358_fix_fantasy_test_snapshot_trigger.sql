-- O mesmo gatilho atende rodadas oficiais e sessoes de teste. As sessoes nao
-- possuem fantasy_season_id; ambas possuem round_id, que determina a pelada.
BEGIN;
DO $$
DECLARE definition text;
  old_lookup constant text := 'JOIN public[.]fantasy_seasons season ON season[.]league_id=fantasy_settings[.]league_id[[:space:]]+WHERE season[.]id=NEW[.]fantasy_season_id LIMIT 1;';
  new_lookup constant text := 'JOIN public.rounds round_item ON round_item.league_id=fantasy_settings.league_id
  WHERE round_item.id=NEW.round_id LIMIT 1;';
BEGIN
  SELECT pg_get_functiondef('public.set_role_scoring_activation_from_round_two()'::regprocedure) INTO definition;
  IF (SELECT count(*) FROM regexp_matches(definition,old_lookup,'g')) <> 1 THEN
    RAISE EXCEPTION 'Gatilho do snapshot divergiu; revisar antes da migration 358.';
  END IF;
  EXECUTE regexp_replace(definition,old_lookup,new_lookup);
END $$;
COMMIT;
