-- DEF, MEI/ALA e ATA são escolhas do próprio atleta no perfil. GOL continua
-- fora do perfil: é uma vaga livre da escalação e depende do rodízio real.

CREATE OR REPLACE FUNCTION public.protect_fantasy_player_positions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_app_admin() THEN
    IF NEW.is_goalkeeper IS DISTINCT FROM OLD.is_goalkeeper THEN
      RAISE EXCEPTION 'GOL não é uma tag de perfil e não pode ser alterada aqui.';
    END IF;
    IF NEW.player_profile IS DISTINCT FROM OLD.player_profile
      AND NOT EXISTS (
        SELECT 1 FROM public.account_profiles profile
        WHERE profile.user_id = auth.uid() AND profile.player_id = OLD.id
      ) THEN
      RAISE EXCEPTION 'Você só pode alterar a posição do seu próprio perfil.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
