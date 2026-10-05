-- Usa todos os horários disponíveis dos gols sofridos na proteção defensiva.
-- O histórico sem eventos completos continua usando o fallback conservador.

BEGIN;

UPDATE public.overall_formula_versions
SET label = 'OVR adaptativo v18 — proteção defensiva por linha do tempo',
    config = jsonb_set(config, '{allConcededGoalTimingEnabled}', 'true'::jsonb, true)
WHERE key = 'adaptive-v18-fluid-profile';

NOTIFY pgrst, 'reload schema';
COMMIT;
