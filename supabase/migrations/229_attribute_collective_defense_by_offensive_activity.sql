-- Clean sheet e poucos gols sofridos são resultados coletivos. Quanto maior a
-- produção ofensiva do atleta por tempo jogado, maior a parcela direcionada ao
-- ATA e menor o crédito coletivo usado no OVR DEF.

BEGIN;

UPDATE public.overall_formula_versions
SET label = 'OVR adaptativo v18 — crédito DEF por contribuição',
    config = jsonb_set(
      jsonb_set(
        config,
        '{defensiveOffensePenalty}',
        '0'::jsonb,
        true
      ),
      '{defensiveCollectiveCreditReduction}',
      '0.6'::jsonb,
      true
    )
WHERE key = 'adaptive-v18-fluid-profile';

NOTIFY pgrst, 'reload schema';
COMMIT;
