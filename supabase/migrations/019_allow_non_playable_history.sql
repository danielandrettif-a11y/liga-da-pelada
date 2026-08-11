-- Permite reclassificar atletas com historico como WAG ou torcedor.
-- O historico permanece intacto em player_round_stats e volta a aparecer
-- caso a pessoa seja promovida novamente a uma categoria jogavel.

CREATE OR REPLACE FUNCTION normalize_player_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (NEW.member_category IS DISTINCT FROM OLD.member_category OR NEW.is_selectable IS DISTINCT FROM OLD.is_selectable)
    AND NOT is_app_admin()
  THEN
    RAISE EXCEPTION 'Somente administradores podem alterar categoria e elegibilidade.';
  END IF;

  IF NEW.member_category IN ('wag', 'supporter') THEN
    NEW.is_selectable := false;
    NEW.player_profile := NULL;
  ELSE
    NEW.player_profile := COALESCE(NEW.player_profile, 'midfield');
    IF NEW.member_category = 'player' THEN
      NEW.is_selectable := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_normalize_category ON players;
CREATE TRIGGER players_normalize_category
BEFORE INSERT OR UPDATE OF member_category, player_profile, is_selectable ON players
FOR EACH ROW EXECUTE FUNCTION normalize_player_category();
