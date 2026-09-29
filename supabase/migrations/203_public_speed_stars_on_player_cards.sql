-- A velocidade continua fora do OVR e da pontuação; apenas sua classificação
-- de 1 a 3 estrelas passa a ser pública nas cartas de jogadores competitivos.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_player_speed_ratings()
RETURNS TABLE (player_id UUID, speed_rating SMALLINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT attributes.player_id, attributes.speed_rating
  FROM public.player_admin_attributes attributes
  JOIN public.players player ON player.id = attributes.player_id
  WHERE player.is_competitive_profile_complete = true
    AND attributes.speed_rating BETWEEN 1 AND 3;
$function$;

REVOKE ALL ON FUNCTION public.get_public_player_speed_ratings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_player_speed_ratings() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
